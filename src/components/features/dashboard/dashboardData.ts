import { FileText, Database, Sparkles, Palette, Target } from 'lucide-react';

// Hero Section Configuration
export const heroConfig = {
  badge: {
    icon: Sparkles,
    text: 'Material intelligence',
  },
  title: "Let's find the right",
  subtitle: 'material for the job.',
  searchPlaceholder: 'Code, description, model, brand or barcode…',
  searchHints: ['code', 'description', 'model', 'brand', 'barcode'],
};

// Hero task tiles — the four jobs the dashboard exists to start.
// Every path is a route registered in App.tsx.
export const heroTasks: HeroTask[] = [
  {
    icon: FileText,
    title: 'Prepare a quote',
    description: 'Build a priced proposal with JARVIS',
    path: '/agent-hub?q=Help%20me%20prepare%20a%20quote%20for%20a%20customer',
  },
  {
    icon: Database,
    title: 'Browse the catalog',
    description: 'Materials, brands and specs',
    path: '/discover',
  },
  {
    icon: Target,
    title: 'Compare products',
    description: 'Specs and pricing side by side',
    path: '/compare',
  },
  {
    icon: Palette,
    title: 'Build a moodboard',
    description: 'Curate materials for a project',
    path: '/moodboard',
  },
];

export interface HeroTask {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  path: string;
}
