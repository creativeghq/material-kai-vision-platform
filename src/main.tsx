import { createRoot } from 'react-dom/client';
import Test from './test.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(<Test />);
