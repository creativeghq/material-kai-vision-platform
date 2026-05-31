export interface ModelConfig {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'meta' | 'google';
  model: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  speed: 'fast' | 'medium' | 'slow';
  usedFor: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface UsageAnalytics {
  total_searches: number;
  total_api_calls: number;
  active_users: number;
  avg_response_time: number;
}

export interface AgentChatMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  metadata: {
    agentId?: string;
    model?: string;
    responseTimeMs?: number;
    productsCount?: number;
    cachedResponse?: boolean;
    rating?: 'up' | 'down' | null;
    ratedAt?: string;
    worldData?: {
      vrWorldId?: string;
      status?: string;
      splatUrl100k?: string;
      splatUrl500k?: string;
      splatUrlFull?: string;
      sourceImageUrl?: string;
      caption?: string;
      prompt?: string;
    };
    videoData?: {
      job_id?: string;
      status?: string;
      video_url?: string;
    };
    materialsBoardData?: {
      job_id?: string;
      image_url?: string;
      board_mode?: string;
      credits_used?: number;
    };
    geminiImageData?: Record<string, unknown>;
    generation_job?: Record<string, unknown>;
  } | null;
  created_at: string;
  user_email?: string;
  user_id?: string;
}

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
export interface ApiUsageLog {
  id: string;
  user_id: string | null;
  endpoint_id: string | null;
  request_path: string;
  request_method: string;
  response_status: number | null;
  response_time_ms: number | null;
  ip_address: string | null;
  user_agent: string | null;
  is_internal_request: boolean;
  rate_limit_exceeded: boolean;
  created_at: string | null;
}

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
  scraping: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
    totalPages: number;
  };
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
