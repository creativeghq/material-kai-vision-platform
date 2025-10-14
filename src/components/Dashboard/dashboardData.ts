import {
  FileText,
  Database,
  Brain,
  Sparkles,
  Upload,
  Star,
  Palette,
  Sparkles,
  Target,
  TrendingUp,
  Shield,
} from 'lucide-react';

// Hero Section Configuration
export const heroConfig = {
  badge: {
    icon: Sparkles,
    text: 'Powered by Advanced AI',
  },
  title: 'Material Intelligence',
  subtitle: 'Agent Platform',
  description: 'Transform your material workflows with AI-powered PDF knowledge extraction, intelligent search, and autonomous 3D design generation',
  actions: [
    {
      type: 'primary' as const,
      icon: Upload,
      text: 'Start Processing',
      path: '/pdf-processing',
    },
    {
      type: 'outline' as const,
      icon: Brain,
      text: 'AI Studio',
      path: '/agents',
    },
  ],
};

// Feature Cards Configuration
export const featuresConfig = {
  sectionHeader: {
    title: 'Intelligent Material Processing',
    description: 'Harness the power of AI to revolutionize your material research and design workflows',
  },
  cards: [
    {
      id: 'pdf-processing',
      icon: FileText,
      iconColor: 'primary' as const,
      badge: 'Core Engine',
      title: 'PDF Knowledge Extraction',
      description: 'Advanced AI-powered document processing with intelligent material recognition and semantic understanding',
      action: {
        icon: Upload,
        text: 'Process Documents →',
        color: 'primary' as const,
      },
      path: '/pdf-processing',
    },
    {
      id: '3d-generation',
      icon: Sparkles,
      iconColor: 'purple' as const,
      badge: 'AI Designer',
      title: '3D Generation Studio',
      description: 'Generate photorealistic 3D designs with intelligent material suggestions and real-time optimization',
      action: {
        icon: Brain,
        text: 'Create Design →',
        color: 'purple' as const,
      },
      path: '/3d',
    },
    {
      id: 'moodboard',
      icon: Palette,
      iconColor: 'orange' as const,
      badge: 'Collections',
      title: 'Smart MoodBoards',
      description: 'Curate and organize materials with AI-powered recommendations and collaborative features',
      action: {
        icon: Star,
        text: 'Build Collection →',
        color: 'orange' as const,
      },
      path: '/moodboard',
    },
  ],
};

// Metrics Configuration
export const metricsConfig = {
  sectionHeader: {
    title: 'Platform Performance',
    description: 'Real-time insights into our AI-powered processing engine',
  },
  metrics: [
    {
      id: 'documents',
      icon: Database,
      iconColor: 'text-primary',
      value: '1,247',
      valueColor: 'primary' as const,
      label: 'Documents Processed',
      change: '+12% this week',
    },
    {
      id: 'queries',
      icon: Target,
      iconColor: 'text-blue-500',
      value: '8,432',
      valueColor: 'blue' as const,
      label: 'Search Queries',
      change: '+24% this week',
    },
    {
      id: 'accuracy',
      icon: TrendingUp,
      iconColor: 'text-purple-500',
      value: '94.2%',
      valueColor: 'purple' as const,
      label: 'AI Accuracy',
      change: '+2.1% improved',
    },
    {
      id: 'uptime',
      icon: Shield,
      iconColor: 'text-green-500',
      value: '99.8%',
      valueColor: 'green' as const,
      label: 'System Uptime',
      change: 'Excellent',
    },
  ],
};

// SearchHub Configuration
export const searchHubConfig = {
  onMaterialSelect: (materialId: string) => {
    console.log('Material selected:', materialId);
  },
};

// Type definitions for better TypeScript support
export type ColorVariant = 'primary' | 'purple' | 'orange' | 'blue' | 'green';
export type ButtonType = 'primary' | 'outline';

export interface HeroAction {
  type: ButtonType;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  path: string;
}

export interface FeatureCard {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: ColorVariant;
  badge: string;
  title: string;
  description: string;
  action: {
    icon: React.ComponentType<{ className?: string }>;
    text: string;
    color: ColorVariant;
  };
  path: string;
}

export interface Metric {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  value: string;
  valueColor: ColorVariant;
  label: string;
  change: string;
}
