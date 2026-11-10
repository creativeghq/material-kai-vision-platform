export interface NotificationChannelStats {
  channel: string;
  label: string;
  total: number;
  sent: number;
  failed: number;
  read: number;
}

export interface SearchAnalytic {
  id: string;
  query_text: string;
  results_shown: number;
  clicks_count: number;
  satisfaction_rating: number;
  created_at: string;
  response_time_ms: number;
}

// Mirrors the real public.api_usage_logs columns (request-shaped).
export interface SubscriptionStats {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  totalRevenue: number;
  totalCreditsUsed: number;
}

export interface UserProfile {
  id: string;
  email: string;
  subscription_tier: string;
  subscription_status: string;
  credits_balance: number;
  created_at: string;
}

export interface DataProcessingStats {
  pdf: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    avgProcessingTime: number;
  };
  xml: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    totalProducts: number;
  };
  // No `scraping`: the web-scrape→product path was removed and `scraping_sessions` dropped, so
  // the dashboard's scraping card was fed an empty array purely to keep rendering zeros. A
  // permanently-zero subsystem on an operations board is the signal operators are trained to
  // investigate — the card is deleted rather than stubbed. (#365 AD-12)
}

export interface AIUsageLog {
  id: string;
  user_id: string;
  operation_type: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  billed_cost_usd: number;
  credits_debited: number;
  created_at: string;
}

export interface InteriorDesignStats {
  total_generations: number;
  total_cost: number;
  total_images: number;
  unique_users: number;
}

export interface ModelUsage {
  model_id: string;
  model_name: string;
  usage_count: number;
  total_cost: number;
  success_rate: number;
}

export interface ExternalServiceUsageData {
  summary: {
    total_credits: number;
    total_cost_usd: number;
    total_operations: number;
  };
  by_service: Array<{
    service: string;
    operations: number;
    credits: number;
    cost_usd: number;
  }>;
  by_user: Array<{
    user_id: string;
    total_credits: number;
    operations: number;
  }>;
  timeline: Array<{
    date: string;
    credits: number;
    operations: number;
  }>;
  time_period: string;
}

export interface ResendEmailStats {
  total: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  deliveryRate: number;
  bounceRate: number;
  openRate: number;
}
