/**
 * Price Monitoring Types
 * Shared types for price monitoring components
 */

export interface PriceMonitoringProduct {
  id: string;
  product_id: string;
  user_id: string;
  workspace_id: string;
  monitoring_enabled: boolean;
  monitoring_frequency: 'hourly' | 'daily' | 'weekly' | 'on_demand';
  last_check_at: string | null;
  next_check_at: string | null;
  status: 'active' | 'paused' | 'error';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: string;
  product_id: string;
  source_name: string;
  source_url: string;
  price: number;
  currency: string;
  availability: 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';
  scraped_at: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface CompetitorSource {
  id: string;
  product_id: string;
  source_name: string;
  source_url: string;
  scraping_config: Record<string, any>;
  is_active: boolean;
  last_successful_scrape: string | null;
  error_count: number;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceMonitoringJob {
  id: string;
  product_id: string;
  user_id: string;
  job_type: 'on_demand' | 'scheduled';
  status: 'pending' | 'running' | 'completed' | 'failed';
  sources_checked: number;
  prices_found: number;
  credits_consumed: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export interface PriceAlert {
  id: string;
  user_id: string;
  product_id: string;
  alert_type: 'price_drop' | 'price_increase' | 'any_change' | 'availability';
  threshold_percentage: number | null;
  threshold_amount: number | null;
  notification_channels: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface PriceStatistics {
  min_price: number;
  max_price: number;
  avg_price: number;
  current_price: number;
  price_trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';
  total_sources: number;
}

export interface ProductUsageStats {
  id: string;
  product_id: string;
  moodboard_count: number;
  quote_count: number;
  search_result_count: number;
  view_count: number;
  avg_time_on_page: number | null;
  conversion_rate: number | null;
  last_updated: string;
  created_at: string;
}

