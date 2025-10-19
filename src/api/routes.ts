import { MivaaGatewayController } from './mivaa-gateway';
import { VisualSearchController } from './controllers/visualSearchController';

// Express types (would be imported from @types/express in real implementation)
interface Request {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  params: Record<string, string>;
  query: Record<string, unknown>;
  url: string;
  method: string;
}

interface Response {
  status(code: number): Response;
  json(data: unknown): void;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
}

interface NextFunction {
  (): void;
}

interface RouteHandler {
  (req: Request, res: Response, next?: NextFunction): Promise<void> | void;
}

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: RouteHandler;
  middleware?: RouteHandler[];
}

/**
 * API Routes Configuration
 *
 * Centralizes all API route definitions for the application.
 * Implements the gateway pattern for MIVAA requests and standard document processing.
 */
export class ApiRoutes {
  private mivaaGateway: MivaaGatewayController;
  private visualSearchController: VisualSearchController;

  constructor() {
    this.mivaaGateway = new MivaaGatewayController();
    this.visualSearchController = new VisualSearchController();
  }

  /**
   * Get all API routes configuration
   */
  public getRoutes(): Route[] {
    return [
      // MIVAA Gateway Routes
      {
        method: 'POST',
        path: '/api/mivaa/gateway',
        handler: this.mivaaGateway.processRequest,
        middleware: [],
      },
      {
        method: 'GET',
        path: '/api/mivaa/health',
        handler: this.mivaaGateway.healthCheck,
        middleware: [],
      },

      // Visual Search API Routes
      {
        method: 'POST',
        path: '/api/visual-search/by-image',
        handler: this.visualSearchController.searchByImage,
        middleware: [],
      },
      {
        method: 'POST',
        path: '/api/visual-search/by-description',
        handler: this.visualSearchController.searchByDescription,
        middleware: [],
      },
      {
        method: 'POST',
        path: '/api/visual-search/hybrid',
        handler: this.visualSearchController.hybridSearch,
        middleware: [],
      },
      {
        method: 'POST',
        path: '/api/visual-search/by-properties',
        handler: this.visualSearchController.searchByProperties,
        middleware: [],
      },
      {
        method: 'GET',
        path: '/api/visual-search/analytics',
        handler: this.visualSearchController.getSearchAnalytics,
        middleware: [],
      },
      {
        method: 'GET',
        path: '/api/visual-search/health',
        handler: this.visualSearchController.healthCheck,
        middleware: [],
      },

    ];
  }

  /**
   * Get route by method and path
   */
  public getRoute(method: string, path: string): Route | undefined {
    return this.getRoutes().find(route =>
      route.method === method.toUpperCase() &&
      this.matchPath(route.path, path),
    );
  }

  /**
   * Simple path matching (supports :param syntax)
   */
  private matchPath(routePath: string, requestPath: string): boolean {
    const routeParts = routePath.split('/');
    const requestParts = requestPath.split('/');

    if (routeParts.length !== requestParts.length) {
      return false;
    }

    return routeParts.every((part, index) => {
      if (part.startsWith(':')) {
        return true; // Parameter match
      }
      return part === requestParts[index];
    });
  }

  /**
   * Extract parameters from path
   */
  public extractParams(routePath: string, requestPath: string): Record<string, string> {
    const routeParts = routePath.split('/');
    const requestParts = requestPath.split('/');
    const params: Record<string, string> = {};

    routeParts.forEach((part, index) => {
      if (part.startsWith(':')) {
        const paramName = part.substring(1);
        const paramValue = requestParts[index];
        if (paramValue !== undefined) {
          params[paramName] = paramValue;
        }
      }
    });

    return params;
  }
}

// Export singleton instance
export const apiRoutes = new ApiRoutes();

// Export types for use in other modules
export type { Route, RouteHandler };
