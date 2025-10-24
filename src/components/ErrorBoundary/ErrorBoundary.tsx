/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the app.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { monitoringService } from '@/services/monitoring/monitoringService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'component' | 'critical';
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0;
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Report to error tracking service (e.g., Sentry)
    this.reportError(error, errorInfo);
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // Report to monitoring service
    monitoringService.captureError(error, {
      level: 'error',
      component: this.props.name || 'Unknown Component',
      tags: {
        errorBoundary: 'true',
        level: this.props.level || 'component',
      },
      extra: {
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
        retryCount: this.retryCount,
      },
    });

    // Add breadcrumb for debugging
    monitoringService.addBreadcrumb(
      `Error boundary caught error: ${error.message}`,
      'error_boundary',
      'error',
    );
  };

  private handleRetry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
      });
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private renderErrorDetails = () => {
    const { error, errorInfo, errorId } = this.state;

    if (!error) return null;

    return (
      <div className="mt-4 p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-2 flex items-center">
          <Bug className="w-4 h-4 mr-2" />
          Error Details
        </h4>
        <div className="space-y-2 text-sm">
          <div>
            <strong>Error ID:</strong> {errorId}
          </div>
          <div>
            <strong>Message:</strong> {error.message}
          </div>
          <div>
            <strong>Component:</strong> {this.props.name || 'Unknown'}
          </div>
          <div>
            <strong>Level:</strong> {this.props.level || 'component'}
          </div>
          {process.env.NODE_ENV === 'development' && (
            <>
              <div>
                <strong>Stack Trace:</strong>
                <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
                  {error.stack}
                </pre>
              </div>
              {errorInfo && (
                <div>
                  <strong>Component Stack:</strong>
                  <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  private renderFallbackUI = () => {
    const { level = 'component', name } = this.props;
    const { error } = this.state;

    const canRetry = this.retryCount < this.maxRetries;
    const isPageLevel = level === 'page';
    const isCritical = level === 'critical';

    return (
      <Card className={`w-full ${isCritical ? 'border-destructive' : ''}`}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className={`w-5 h-5 ${isCritical ? 'text-destructive' : 'text-yellow-500'}`} />
            <span>
              {isCritical ? 'Critical Error' :
               isPageLevel ? 'Page Error' : 'Component Error'}
            </span>
            <Badge variant={isCritical ? 'destructive' : 'secondary'}>
              {level}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground">
              {isCritical
                ? 'A critical error has occurred that prevents the application from functioning properly.'
                : isPageLevel
                ? 'An error occurred while loading this page.'
                : `An error occurred in the ${name || 'component'}.`
              }
            </p>
            {error && (
              <p className="mt-2 text-sm font-mono bg-muted p-2 rounded">
                {error.message}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {canRetry && (
              <Button
                onClick={this.handleRetry}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    this.handleRetry();
                  }
                }}
                variant="default">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again ({this.maxRetries - this.retryCount} left)
              </Button>
            )}

            {isPageLevel && (
              <Button
                onClick={this.handleGoHome}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    this.handleGoHome();
                  }
                }}
                variant="outline">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Button>
            )}

            <Button
              onClick={this.handleReload}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  this.handleReload();
                }
              }}
              variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload Page
            </Button>
          </div>

          {process.env.NODE_ENV === 'development' && this.renderErrorDetails()}
        </CardContent>
      </Card>
    );
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return this.renderFallbackUI();
    }

    return this.props.children;
  }
}

// Higher-order component for easy wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

// Specialized error boundaries for different use cases
export const PageErrorBoundary: React.FC<{ children: ReactNode; name?: string }> = ({
  children,
  name,
}) => (
  <ErrorBoundary level="page" name={name}>
    {children}
  </ErrorBoundary>
);

export const ComponentErrorBoundary: React.FC<{ children: ReactNode; name?: string }> = ({
  children,
  name,
}) => (
  <ErrorBoundary level="component" name={name}>
    {children}
  </ErrorBoundary>
);

export const CriticalErrorBoundary: React.FC<{ children: ReactNode; name?: string }> = ({
  children,
  name,
}) => (
  <ErrorBoundary level="critical" name={name}>
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;
