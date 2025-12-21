/**
 * Hook for tracking user interactions with materials
 * Automatically tracks views using IntersectionObserver
 */

import { useEffect, useRef, useCallback } from 'react';
import { RecommendationsService } from '@/services/recommendationsService';

interface UseInteractionTrackingOptions {
  materialId: string;
  source: string; // Where the material is being viewed from
  metadata?: Record<string, any>;
  trackView?: boolean; // Auto-track view when visible (default: true)
  viewThreshold?: number; // Percentage of element visible to trigger view (default: 0.5)
}

export const useInteractionTracking = ({
  materialId,
  source,
  metadata = {},
  trackView = true,
  viewThreshold = 0.5,
}: UseInteractionTrackingOptions) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const hasTrackedView = useRef(false);

  // Track view when element becomes visible
  useEffect(() => {
    if (!trackView || !elementRef.current || hasTrackedView.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasTrackedView.current) {
            hasTrackedView.current = true;
            RecommendationsService.trackView(materialId, {
              source,
              ...metadata,
            });
          }
        });
      },
      {
        threshold: viewThreshold,
        rootMargin: '0px',
      }
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [materialId, source, metadata, trackView, viewThreshold]);

  // Track click
  const trackClick = useCallback(() => {
    RecommendationsService.trackClick(materialId, {
      source,
      ...metadata,
    });
  }, [materialId, source, metadata]);

  // Track save/favorite
  const trackSave = useCallback(() => {
    RecommendationsService.trackSave(materialId, {
      source,
      ...metadata,
    });
  }, [materialId, source, metadata]);

  // Track rating
  const trackRating = useCallback((rating: number) => {
    RecommendationsService.trackRating(materialId, rating, {
      source,
      ...metadata,
    });
  }, [materialId, source, metadata]);

  // Track add to quote
  const trackAddToQuote = useCallback(() => {
    RecommendationsService.trackAddToQuote(materialId, {
      source,
      ...metadata,
    });
  }, [materialId, source, metadata]);

  return {
    elementRef,
    trackClick,
    trackSave,
    trackRating,
    trackAddToQuote,
  };
};

/**
 * Simplified hook for just tracking clicks
 */
export const useClickTracking = (
  materialId: string,
  source: string,
  metadata?: Record<string, any>
) => {
  return useCallback(() => {
    RecommendationsService.trackClick(materialId, {
      source,
      ...metadata,
    });
  }, [materialId, source, metadata]);
};

/**
 * Simplified hook for just tracking views
 */
export const useViewTracking = (
  materialId: string,
  source: string,
  metadata?: Record<string, any>
) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const hasTrackedView = useRef(false);

  useEffect(() => {
    if (!elementRef.current || hasTrackedView.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasTrackedView.current) {
            hasTrackedView.current = true;
            RecommendationsService.trackView(materialId, {
              source,
              ...metadata,
            });
          }
        });
      },
      {
        threshold: 0.5,
      }
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [materialId, source, metadata]);

  return elementRef;
};

