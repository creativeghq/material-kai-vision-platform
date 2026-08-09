/**
 * The loading and failure chrome every R3F canvas in this app needs (#321).
 *
 * Extracted from `ARPreviewModal`, which owned the only copies, when the #260 configurator became
 * the second surface mounting `ProductModelStage`. A copied error boundary is the kind of thing
 * that drifts silently — one of them stops reporting the error message, or catches a different
 * set of failures — and nobody notices, because both still look like a boundary.
 *
 * A boundary is not optional here: a WebGL context failure or a malformed GLB throws during
 * render, and without one the whole page unmounts to a blank screen.
 */
import React from 'react';

export const CanvasLoader: React.FC<{ label?: string }> = ({ label = 'Loading 3D preview...' }) => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  </div>
);

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ThreeErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full w-full items-center justify-center bg-muted/30 p-8">
            <div className="text-center">
              <p className="text-sm font-medium text-destructive">
                Failed to load 3D preview
              </p>
              {/* The message is shown on purpose: "it broke" sends a tenant to support, whereas
                  "Unexpected token in GLB" sends them back to their exporter. */}
              <p className="mt-1 text-xs text-muted-foreground">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
