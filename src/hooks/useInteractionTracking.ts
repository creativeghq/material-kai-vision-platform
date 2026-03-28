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
  // Keep metadata in a ref so callbacks always use the latest value without
  // causing the observer/callbacks to be recreated on every render.
  const metadataRef = useRef(metadata);
  useEffect(() => { metadataRef.current = metadata; });

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
              ...metadataRef.current,
            });
          }
        });
      },
      {
        threshold: viewThreshold,
        rootMargin: '0px',
      },
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [materialId, source, trackView, viewThreshold]); // metadata intentionally excluded — tracked via ref

  // Track click
  const trackClick = useCallback(() => {
    RecommendationsService.trackClick(materialId, {
      source,
      ...metadataRef.current,
    });
  }, [materialId, source]);

  // Track rating
  const trackRating = useCallback((rating: number) => {
    RecommendationsService.trackRating(materialId, rating, {
      source,
      ...metadataRef.current,
    });
  }, [materialId, source]);

  // Track add to quote
  const trackAddToQuote = useCallback(() => {
    RecommendationsService.trackAddToQuote(materialId, {
      source,
      ...metadataRef.current,
    });
  }, [materialId, source]);

  return {
    elementRef,
    trackClick,
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
  metadata?: Record<string, any>,
) => {
  const metadataRef = useRef(metadata);
  useEffect(() => { metadataRef.current = metadata; });
  return useCallback(() => {
    RecommendationsService.trackClick(materialId, {
      source,
      ...metadataRef.current,
    });
  }, [materialId, source]);
};

/**
 * Simplified hook for just tracking views
 */
export const useViewTracking = (
  materialId: string,
  source: string,
  metadata?: Record<string, any>,
) => {
  const elementRef = useRef<HTMLElement | null>(null);
  const hasTrackedView = useRef(false);
  const metadataRef = useRef(metadata);
  useEffect(() => { metadataRef.current = metadata; });

  useEffect(() => {
    if (!elementRef.current || hasTrackedView.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasTrackedView.current) {
            hasTrackedView.current = true;
            RecommendationsService.trackView(materialId, {
              source,
              ...metadataRef.current,
            });
          }
        });
      },
      {
        threshold: 0.5,
      },
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [materialId, source]); // metadata intentionally excluded — tracked via ref

  return elementRef;
};
