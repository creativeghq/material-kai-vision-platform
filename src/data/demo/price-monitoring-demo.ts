/**
 * Demo Price Monitoring Data
 * Provides realistic price monitoring data for Demo Agent products
 */

export interface DemoCompetitorSource {
  id: string;
  source_name: string;
  source_url: string;
  is_active: boolean;
  last_successful_scrape: string;
}

export interface DemoCompetitorPrice {
  id: string;
  source_name: string;
  source_url: string;
  price: number;
  currency: string;
  availability: 'in_stock' | 'out_of_stock' | 'limited_stock';
  scraped_at: string;
}

export interface DemoPriceHistory {
  date: string;
  price: number;
  source: string;
  availability: string;
}

/**
 * Generate demo competitor sources for a product
 */
export function getDemoCompetitorSources(productId: string): DemoCompetitorSource[] {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  return [
    {
      id: `demo-source-${productId}-1`,
      source_name: 'BuildMart Online',
      source_url: 'https://buildmart.example.com/products/tiles',
      is_active: true,
      last_successful_scrape: yesterday.toISOString(),
    },
    {
      id: `demo-source-${productId}-2`,
      source_name: 'TilesDirect Pro',
      source_url: 'https://tilesdirect.example.com/cement-tiles',
      is_active: true,
      last_successful_scrape: now.toISOString(),
    },
    {
      id: `demo-source-${productId}-3`,
      source_name: 'MaterialHub Supply',
      source_url: 'https://materialhub.example.com/flooring',
      is_active: true,
      last_successful_scrape: twoDaysAgo.toISOString(),
    },
  ];
}

/**
 * Generate demo competitor prices for a product
 */
export function getDemoCompetitorPrices(
  productId: string,
  basePrice: number = 45.99,
  currency: string = 'EUR',
): DemoCompetitorPrice[] {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  return [
    {
      id: `demo-price-${productId}-1`,
      source_name: 'BuildMart Online',
      source_url: 'https://buildmart.example.com/products/tiles',
      price: basePrice * 1.08, // 8% higher
      currency,
      availability: 'in_stock',
      scraped_at: oneHourAgo.toISOString(),
    },
    {
      id: `demo-price-${productId}-2`,
      source_name: 'TilesDirect Pro',
      source_url: 'https://tilesdirect.example.com/cement-tiles',
      price: basePrice * 0.95, // 5% lower
      currency,
      availability: 'in_stock',
      scraped_at: now.toISOString(),
    },
    {
      id: `demo-price-${productId}-3`,
      source_name: 'MaterialHub Supply',
      source_url: 'https://materialhub.example.com/flooring',
      price: basePrice * 1.12, // 12% higher
      currency,
      availability: 'limited_stock',
      scraped_at: twoHoursAgo.toISOString(),
    },
  ];
}

/**
 * Generate demo price history for charts
 */
export function getDemoPriceHistory(
  productId: string,
  basePrice: number = 45.99,
  days: number = 30,
): DemoPriceHistory[] {
  const history: DemoPriceHistory[] = [];
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

    // Add some realistic price variation
    const variation = Math.sin(i / 5) * 0.05 + (Math.random() - 0.5) * 0.03;
    const price = basePrice * (1 + variation);

    history.push({
      date: date.toISOString().split('T')[0],
      price: Math.round(price * 100) / 100,
      source: i % 3 === 0 ? 'BuildMart Online' : i % 3 === 1 ? 'TilesDirect Pro' : 'MaterialHub Supply',
      availability: 'in_stock',
    });
  }

  return history;
}

/**
 * Check if a product ID is a demo product
 */
export function isDemoProduct(productId: string): boolean {
  return productId.startsWith('demo-');
}

/**
 * Get demo monitoring configuration
 */
export function getDemoMonitoringConfig() {
  return {
    monitoring_enabled: true,
    monitoring_frequency: 'daily' as const,
  };
}

