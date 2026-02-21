/**
 * WorldViewer Component
 *
 * Renders explorable 3D Gaussian Splat worlds using Spark.js (WorldLabs' Three.js renderer).
 * Supports orbit controls + first-person (WASD) navigation with a toggle.
 * Handles polling for generation status and progressive loading.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WebGLRenderer, Scene, PerspectiveCamera } from 'three';
// Static import ensures @sparkjsdev/spark shares the SAME Three.js module instance
// as the rest of the app — dynamic import() creates a separate chunk with its own
// THREE, causing instanceof checks to fail and constructors to appear as undefined.
import { SparkRenderer, SplatLoader, SplatMesh, SparkControls } from '@sparkjsdev/spark';
import {
  Maximize2,
  Minimize2,
  Eye,
  Move3D,
  Loader2,
  AlertCircle,
  RotateCcw,
  Globe,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type NavigationMode = 'orbit' | 'firstperson';
type QualityLevel = 'draft' | 'standard' | 'full';

interface WorldViewerProps {
  vrWorldId: string;
  initialStatus?: string;
  splatUrls?: {
    draft?: string;
    standard?: string;
    full?: string;
  };
  colliderUrl?: string;
  caption?: string;
  onRetry?: () => void;
}

// Status display configuration
const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  pending: { label: 'Preparing VR generation...', icon: <Loader2 className="w-6 h-6 animate-spin text-violet-400" /> },
  uploading: { label: 'Uploading design image...', icon: <Loader2 className="w-6 h-6 animate-spin text-blue-400" /> },
  generating: { label: 'Creating your 3D world...', icon: <Globe className="w-6 h-6 animate-pulse text-violet-400" /> },
  completed: { label: 'World ready!', icon: <Sparkles className="w-6 h-6 text-green-400" /> },
  failed: { label: 'Generation failed', icon: <AlertCircle className="w-6 h-6 text-red-400" /> },
};

export const WorldViewer: React.FC<WorldViewerProps> = ({
  vrWorldId,
  initialStatus,
  splatUrls: initialSplatUrls,
  caption: initialCaption,
  onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<any>(null); // Three.js scene objects
  const animFrameRef = useRef<number>(0);
  const isVisibleRef = useRef(true);

  const [status, setStatus] = useState(initialStatus || 'pending');
  const [splatUrls, setSplatUrls] = useState(initialSplatUrls || {});
  const [caption, setCaption] = useState(initialCaption || '');
  const [errorMessage, setErrorMessage] = useState('');
  const [navMode, setNavMode] = useState<NavigationMode>('orbit');
  const [quality, setQuality] = useState<QualityLevel>('standard');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [splatLoading, setSplatLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Poll for generation status
  useEffect(() => {
    if (status === 'completed' || status === 'failed') return;

    let isCancelled = false;
    let pollCount = 0;
    const startTime = Date.now();

    const getInterval = (count: number) => {
      if (count < 5) return 2000;
      if (count < 15) return 3000;
      if (count < 30) return 5000;
      return 10000;
    };

    const poll = async () => {
      if (isCancelled) return;

      try {
        const { data, error } = await supabase
          .from('vr_worlds')
          .select('status, error_message, splat_url_100k, splat_url_500k, splat_url_full, collider_glb_url, panorama_url, thumbnail_url, caption')
          .eq('id', vrWorldId)
          .single();

        if (error || !data || isCancelled) return;

        setStatus(data.status);

        if (data.status === 'completed') {
          setSplatUrls({
            draft: data.splat_url_100k || undefined,
            standard: data.splat_url_500k || undefined,
            full: data.splat_url_full || undefined,
          });
          setCaption(data.caption || '');
          return; // Stop polling
        }

        if (data.status === 'failed') {
          setErrorMessage(data.error_message || 'Unknown error');
          return; // Stop polling
        }
      } catch (err) {
        console.error('[WorldViewer] Poll error:', err);
      }

      pollCount++;
      if (!isCancelled) {
        setTimeout(poll, getInterval(pollCount));
      }
    };

    poll();

    // Update elapsed time counter
    const timerInterval = setInterval(() => {
      if (!isCancelled) {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }
    }, 1000);

    return () => {
      isCancelled = true;
      clearInterval(timerInterval);
    };
  }, [vrWorldId, status]);

  // Initialize Three.js + Spark scene when completed
  // Pattern matches the official WorldLabs web example exactly:
  // github.com/worldlabsai/worldlabs-api-examples/tree/main/web-generate-world
  useEffect(() => {
    if (status !== 'completed') return;

    const url = getSplatUrl(quality, splatUrls);
    if (!url || !canvasRef.current) return;

    let disposed = false;
    setSplatLoading(true);
    setLoadError('');

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // @ts-expect-error three@0.160 types mismatch with @types/three@0.179
    const renderer = new WebGLRenderer({ canvas });
    // @ts-expect-error three@0.160 types mismatch with @types/three@0.179
    const scene = new Scene();
    // @ts-expect-error three@0.160 types mismatch with @types/three@0.179
    const camera = new PerspectiveCamera(65, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
    scene.add(camera);

    // SparkRenderer added to scene (official pattern — NOT camera.add)
    // @ts-expect-error spark types
    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    const controls = new SparkControls({ canvas });

    const resizeToContainer = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 450;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resizeToContainer();

    const resizeObserver = new ResizeObserver(resizeToContainer);
    resizeObserver.observe(container);

    // @ts-expect-error three@0.160 types mismatch with @types/three@0.179
    sceneRef.current = { renderer, scene, camera, spark, controls };

    // Animation loop — matches official example exactly
    renderer.setAnimationLoop(() => {
      if (disposed) { renderer.setAnimationLoop(null); return; }
      if (!isVisibleRef.current) return;
      if (sceneRef.current?.splatMesh) controls.update(camera);
      renderer.render(scene, camera);
    });

    // Load splat via SplatLoader (official pattern — NOT new SplatMesh({ url }))
    const loader = new SplatLoader();
    loader.loadAsync(url)
      .then((packedSplats: any) => {
        if (disposed) return;
        const splatMesh = new SplatMesh({ packedSplats });
        // @ts-expect-error three@0.160 types mismatch with @types/three@0.179
        splatMesh.quaternion.set(1, 0, 0, 0); // identity rotation
        scene.add(splatMesh);
        // Position camera at world origin (official default)
        camera.position.set(0, 0, 0);
        // @ts-expect-error three@0.160 types mismatch with @types/three@0.179
        camera.quaternion.set(0, 0, 0, 1);
        sceneRef.current.splatMesh = splatMesh;
        setSplatLoading(false);
        setIsSceneReady(true);
      })
      .catch((err: unknown) => {
        if (disposed) return;
        const msg = err instanceof Error ? err.message : 'Failed to load 3D world data';
        console.error('[WorldViewer] SplatLoader error:', err);
        setSplatLoading(false);
        setLoadError(msg);
      });

    return () => {
      disposed = true;
      if (sceneRef.current) {
        const { renderer: r, spark: s, splatMesh: m, resizeObserver: ro } = sceneRef.current;
        r?.setAnimationLoop(null);
        ro?.disconnect();
        m?.dispose();
        s?.dispose();
        r?.dispose();
        sceneRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, [status, quality, splatUrls]);

  // IntersectionObserver to pause rendering when off-screen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Toggle navigation mode
  const toggleNavMode = useCallback(() => {
    if (!sceneRef.current) return;
    const { controls } = sceneRef.current;
    const newMode: NavigationMode = navMode === 'orbit' ? 'firstperson' : 'orbit';

    if (newMode === 'firstperson') {
      controls.pointerControls.enable = false;
      controls.fpsMovement.enable = true;
    } else {
      controls.pointerControls.enable = true;
      controls.fpsMovement.enable = false;
    }

    setNavMode(newMode);
  }, [navMode]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  // Listen for fullscreen changes (ESC key exits)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Loading / error states
  if (status !== 'completed') {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

    return (
      <div
        ref={containerRef}
        className="relative h-[450px] rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-violet-900 flex flex-col items-center justify-center overflow-hidden border border-white/10"
      >
        {/* Animated background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.3),transparent_70%)] animate-pulse" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-4">
          {config.icon}
          <p className="text-white/90 font-medium text-sm">{config.label}</p>

          {(status === 'generating' || status === 'uploading') && (
            <p className="text-white/50 text-xs">{elapsedSeconds}s elapsed</p>
          )}

          {status === 'failed' && (
            <div className="flex flex-col items-center gap-2 mt-2">
              <p className="text-red-300/70 text-xs max-w-[300px] text-center">{errorMessage}</p>
              <p className="text-white/50 text-xs">Credits have been refunded</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/90 rounded-lg text-xs transition-colors mt-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Completed — show the 3D viewer
  return (
    <div
      ref={containerRef}
      className="relative h-[450px] rounded-xl overflow-hidden bg-black border border-white/10 group"
    >
      {/* Three.js Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        tabIndex={0}
      />

      {/* Loading overlay for splat */}
      {(splatLoading || loadError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="flex flex-col items-center gap-2">
            {loadError ? (
              <>
                <AlertCircle className="w-6 h-6 text-red-400" />
                <p className="text-red-300 text-xs text-center max-w-[280px]">{loadError}</p>
              </>
            ) : (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                <p className="text-white/80 text-xs">Loading 3D world...</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Controls overlay — visible on hover */}
      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        {/* Navigation toggle */}
        <button
          onClick={toggleNavMode}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg text-xs backdrop-blur-sm transition-colors"
          title={navMode === 'orbit' ? 'Switch to First Person (WASD)' : 'Switch to Orbit'}
        >
          {navMode === 'orbit' ? (
            <>
              <Eye className="w-3.5 h-3.5" />
              Orbit
            </>
          ) : (
            <>
              <Move3D className="w-3.5 h-3.5" />
              Walk
            </>
          )}
        </button>

        {/* Quality selector */}
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value as QualityLevel)}
          className="px-2 py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg text-xs backdrop-blur-sm border-none outline-none cursor-pointer"
          title="Rendering quality"
        >
          {splatUrls.draft && <option value="draft">Draft</option>}
          {splatUrls.standard && <option value="standard">Standard</option>}
          {splatUrls.full && <option value="full">Full</option>}
        </select>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* First-person help overlay */}
      {navMode === 'firstperson' && isSceneReady && (
        <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-black/60 text-white/70 rounded-lg text-xs backdrop-blur-sm z-20">
          WASD to move &middot; Mouse to look &middot; Shift for speed
        </div>
      )}

      {/* Caption */}
      {caption && (
        <div className="absolute bottom-3 right-3 max-w-[250px] px-3 py-1.5 bg-black/60 text-white/70 rounded-lg text-xs backdrop-blur-sm z-20 truncate">
          {caption}
        </div>
      )}
    </div>
  );
};

// Helper to pick the best available splat URL for the chosen quality
function getSplatUrl(
  quality: QualityLevel,
  urls: { draft?: string; standard?: string; full?: string },
): string | undefined {
  if (quality === 'full' && urls.full) return urls.full;
  if (quality === 'standard' && urls.standard) return urls.standard;
  if (quality === 'draft' && urls.draft) return urls.draft;
  // Fallback: pick whatever is available
  return urls.standard || urls.draft || urls.full;
}

export default WorldViewer;
