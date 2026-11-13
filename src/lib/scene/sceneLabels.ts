import type { SceneReadStatus, SceneSourceKind } from '@/services/sceneStudioService';

export const SCENE_READ_STATUS: Record<SceneReadStatus, { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  none: { label: 'Ready', variant: 'neutral' },
  extracting: { label: 'Reading', variant: 'info' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
};

export const SCENE_SOURCE_LABEL: Record<SceneSourceKind, string> = {
  blank: 'Blank Room',
  plan_image: 'Floor Plan',
  photo: 'Photo',
  render: 'Render',
  drawing: 'Drawing',
};

export const sceneSourceLabel = (kind: string): string => SCENE_SOURCE_LABEL[kind as SceneSourceKind] ?? 'Room';
