-- Migration: Credit Management Functions
-- Description: Database functions for atomic credit operations
-- Date: 2025-01-10

-- ============================================
-- Function: debit_user_credits
-- Description: Atomically debit credits from user account
-- ============================================

CREATE OR REPLACE FUNCTION debit_user_credits(
  p_user_id UUID,
  p_amount DECIMAL(10,2),
  p_operation_type VARCHAR(50),
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  new_balance DECIMAL(10,2),
  transaction_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_current_balance DECIMAL(10,2);
  v_new_balance DECIMAL(10,2);
  v_transaction_id UUID;
BEGIN
  -- Lock the user_credits row for update
  SELECT balance INTO v_current_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if user has credits record
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false AS success,
      0::DECIMAL(10,2) AS new_balance,
      NULL::UUID AS transaction_id,
      'User credits record not found'::TEXT AS error_message;
    RETURN;
  END IF;

  -- Check if user has sufficient credits
  IF v_current_balance < p_amount THEN
    RETURN QUERY SELECT 
      false AS success,
      v_current_balance AS new_balance,
      NULL::UUID AS transaction_id,
      format('Insufficient credits. Required: %s, Available: %s', p_amount, v_current_balance)::TEXT AS error_message;
    RETURN;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - p_amount;

  -- Update user credits
  UPDATE user_credits
  SET 
    balance = v_new_balance,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Create transaction record
  INSERT INTO credit_transactions (
    user_id,
    transaction_type,
    amount,
    balance_after,
    description,
    metadata
  ) VALUES (
    p_user_id,
    'debit',
    -p_amount, -- Negative for debit
    v_new_balance,
    COALESCE(p_description, format('Debit for %s', p_operation_type)),
    jsonb_build_object(
      'operation_type', p_operation_type,
      'metadata', p_metadata
    )
  )
  RETURNING id INTO v_transaction_id;

  -- Return success
  RETURN QUERY SELECT 
    true AS success,
    v_new_balance AS new_balance,
    v_transaction_id AS transaction_id,
    NULL::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: grant_credits
-- Description: Grant credits to user (purchase, bonus, monthly grant)
-- ============================================

CREATE OR REPLACE FUNCTION grant_credits(
  p_user_id UUID,
  p_amount DECIMAL(10,2),
  p_transaction_type VARCHAR(50),
  p_description TEXT DEFAULT NULL,
  p_stripe_payment_intent_id TEXT DEFAULT NULL,
  p_stripe_invoice_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  new_balance DECIMAL(10,2),
  transaction_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_current_balance DECIMAL(10,2);
  v_new_balance DECIMAL(10,2);
  v_transaction_id UUID;
BEGIN
  -- Get current balance (lock for update)
  SELECT balance INTO v_current_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- If no credits record exists, create one
  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, balance)
    VALUES (p_user_id, 0)
    RETURNING balance INTO v_current_balance;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance + p_amount;

  -- Update user credits
  UPDATE user_credits
  SET 
    balance = v_new_balance,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Create transaction record
  INSERT INTO credit_transactions (
    user_id,
    transaction_type,
    amount,
    balance_after,
    stripe_payment_intent_id,
    stripe_invoice_id,
    description,
    metadata
  ) VALUES (
    p_user_id,
    p_transaction_type,
    p_amount, -- Positive for grant
    v_new_balance,
    p_stripe_payment_intent_id,
    p_stripe_invoice_id,
    COALESCE(p_description, format('Credit grant: %s', p_transaction_type)),
    p_metadata
  )
  RETURNING id INTO v_transaction_id;

  -- Return success
  RETURN QUERY SELECT 
    true AS success,
    v_new_balance AS new_balance,
    v_transaction_id AS transaction_id,
    NULL::TEXT AS error_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON FUNCTION debit_user_credits IS 'Atomically debit credits from user account with transaction logging';
COMMENT ON FUNCTION grant_credits IS 'Grant credits to user (purchase, bonus, monthly grant) with transaction logging';

