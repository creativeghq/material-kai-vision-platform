import React, { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { ProductModelStage } from './components/features/ar/ProductModelViewer';
const App = () => {
  const [ready, setReady] = useState(false);
  return (<div style={{ width: '100%', height: '100%' }}>
    <Suspense fallback={null}>
      <Canvas camera={{ position: [0, 2, 4], fov: 50 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%' }} onCreated={() => setTimeout(() => setReady(true), 1500)}>
        <ProductModelStage url="/__dev3d-armchair.glb" />
      </Canvas>
    </Suspense>
    <div id="render-state" data-ready={ready ? 'yes' : 'no'} style={{ position: 'fixed', bottom: 4, left: 8, color: '#fff', font: '11px monospace' }}>{ready ? 'RENDERED' : 'loading'}</div>
  </div>);
};
createRoot(document.getElementById('root')!).render(<App />);
