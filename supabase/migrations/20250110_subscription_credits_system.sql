-- Migration: Subscription & Credits System
-- Description: Add tables and fields for Stripe integration, AI usage tracking, and credit management
-- Date: 2025-01-10

-- ============================================
-- 1. Update user_profiles with Stripe fields
-- ============================================

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP,
ADD COLUMN IF NOT EXISTS monthly_credits_granted BOOLEAN DEFAULT FALSE;

-- Create index for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer 
ON user_profiles(stripe_customer_id);

-- Add comments
COMMENT ON COLUMN user_profiles.stripe_customer_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN user_profiles.stripe_subscription_id IS 'Current Stripe subscription ID';
COMMENT ON COLUMN user_profiles.subscription_status IS 'Subscription status: active, canceled, past_due, etc.';
COMMENT ON COLUMN user_profiles.subscription_current_period_end IS 'When current subscription period ends';
COMMENT ON COLUMN user_profiles.monthly_credits_granted IS 'Whether monthly credits have been granted for current period';

-- ============================================
-- 2. Create ai_usage_logs table
-- ============================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  operation_type VARCHAR(50) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  input_cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
  output_cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
  total_cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
  credits_debited DECIMAL(10,2) NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for ai_usage_logs
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user 
ON ai_usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_workspace 
ON ai_usage_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_operation 
ON ai_usage_logs(operation_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created 
ON ai_usage_logs(created_at DESC);

-- Add comment
COMMENT ON TABLE ai_usage_logs IS 'Tracks all AI operations with token usage and costs for billing and analytics';

-- Enable RLS
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own usage logs
CREATE POLICY "Users can view their own AI usage logs"
ON ai_usage_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policy: Admins can view all usage logs
CREATE POLICY "Admins can view all AI usage logs"
ON ai_usage_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role_id IN (
      SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
    )
  )
);

-- RLS Policy: System can insert usage logs
CREATE POLICY "System can insert AI usage logs"
ON ai_usage_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================
-- 3. Create credit_transactions table
-- ============================================

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('purchase', 'debit', 'refund', 'bonus', 'monthly_grant')),
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for credit_transactions
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user 
ON credit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_type 
ON credit_transactions(transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_payment 
ON credit_transactions(stripe_payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_created 
ON credit_transactions(created_at DESC);

-- Add comment
COMMENT ON TABLE credit_transactions IS 'Tracks all credit transactions: purchases, debits, refunds, bonuses';

-- Enable RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own transactions
CREATE POLICY "Users can view their own credit transactions"
ON credit_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policy: Admins can view all transactions
CREATE POLICY "Admins can view all credit transactions"
ON credit_transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role_id IN (
      SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
    )
  )
);

-- RLS Policy: System can insert transactions
CREATE POLICY "System can insert credit transactions"
ON credit_transactions
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON ai_usage_logs TO authenticated;
GRANT INSERT ON ai_usage_logs TO authenticated;
GRANT SELECT ON credit_transactions TO authenticated;
GRANT INSERT ON credit_transactions TO authenticated;

