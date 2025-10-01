import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Minimal test component
function MinimalApp() {
  return (
    <div style={{ padding: '20px', fontSize: '24px', color: 'blue' }}>
      🔍 Testing minimal app - if this works, the issue is in App.tsx imports
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <StrictMode>
    <MinimalApp />
  </StrictMode>
);
