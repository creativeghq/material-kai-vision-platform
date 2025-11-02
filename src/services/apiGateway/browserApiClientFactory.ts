/**
 * Browser API Client Factory
 *
 * Stub implementation to satisfy imports.
 * This service is not actively used in production - all API calls go through MIVAA API.
 */

export interface BrowserApiClient {
  generateImage(params: any): Promise<any>;
  invokeFunction(params: any): Promise<any>;
}

class BrowserApiClientFactory {
  private clients: Map<string, BrowserApiClient> = new Map();

  /**
   * Get a client for a specific API type
   */
  public getClient(apiType: string): BrowserApiClient | null {
    // Return null - not implemented
    // All API calls should go through MIVAA API instead
    return null;
  }

  /**
   * Get available models for an API type
   */
  public getAvailableModels(apiType: string): string[] {
    // Return empty array - not implemented
    return [];
  }

  /**
   * Get model configuration
   */
  public getModelConfig(apiType: string, modelId: string): any {
    // Return null - not implemented
    return null;
  }
}

// Export singleton instance
export const browserApiClientFactory = new BrowserApiClientFactory();

