-- API Gateway System: Core Tables for External/Internal API Access Control

-- API Endpoints Registry
CREATE TABLE api_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path VARCHAR NOT NULL UNIQUE,
  method VARCHAR NOT NULL,
  category VARCHAR NOT NULL DEFAULT 'general',
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_internal BOOLEAN NOT NULL DEFAULT true,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- API Access Control Configuration
CREATE TABLE api_access_control (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID REFERENCES api_endpoints(id) ON DELETE CASCADE,
  network_type VARCHAR NOT NULL CHECK (network_type IN ('internal', 'external', 'both')),
  rate_limit_override INTEGER,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(endpoint_id, network_type)
);

-- Network Definitions for Internal Access
CREATE TABLE internal_networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  cidr_range VARCHAR NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- API Usage Tracking (for rate limiting and analytics)
CREATE TABLE api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID REFERENCES api_endpoints(id),
  user_id UUID,
  ip_address INET NOT NULL,
  user_agent TEXT,
  request_method VARCHAR NOT NULL,
  request_path VARCHAR NOT NULL,
  response_status INTEGER,
  response_time_ms INTEGER,
  is_internal_request BOOLEAN NOT NULL DEFAULT false,
  rate_limit_exceeded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- API Keys for External Access
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  key_name VARCHAR NOT NULL,
  api_key VARCHAR NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit_override INTEGER,
  allowed_endpoints TEXT[], -- Array of endpoint paths
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Rate Limit Rules (custom overrides)
CREATE TABLE rate_limit_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  target_type VARCHAR NOT NULL CHECK (target_type IN ('ip', 'cidr', 'user', 'api_key')),
  target_value VARCHAR NOT NULL,
  requests_per_minute INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE api_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_access_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for API Endpoints (Public read, admin write)
CREATE POLICY "API endpoints are viewable by everyone" 
ON api_endpoints FOR SELECT USING (true);

CREATE POLICY "Only admins can manage API endpoints" 
ON api_endpoints FOR ALL USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for API Access Control
CREATE POLICY "API access control viewable by everyone" 
ON api_access_control FOR SELECT USING (true);

CREATE POLICY "Only admins can manage API access control" 
ON api_access_control FOR ALL USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for Internal Networks
CREATE POLICY "Internal networks viewable by everyone" 
ON internal_networks FOR SELECT USING (true);

CREATE POLICY "Only admins can manage internal networks" 
ON internal_networks FOR ALL USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for API Usage Logs
CREATE POLICY "Users can view their own API usage" 
ON api_usage_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all API usage" 
ON api_usage_logs FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can log API usage" 
ON api_usage_logs FOR INSERT WITH CHECK (true);

-- RLS Policies for API Keys
CREATE POLICY "Users can view their own API keys" 
ON api_keys FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own API keys" 
ON api_keys FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all API keys" 
ON api_keys FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for Rate Limit Rules
CREATE POLICY "Rate limit rules viewable by everyone" 
ON rate_limit_rules FOR SELECT USING (true);

CREATE POLICY "Only admins can manage rate limit rules" 
ON rate_limit_rules FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Indexes for performance
CREATE INDEX idx_api_endpoints_path_method ON api_endpoints(path, method);
CREATE INDEX idx_api_endpoints_is_public ON api_endpoints(is_public);
CREATE INDEX idx_api_usage_logs_created_at ON api_usage_logs(created_at);
CREATE INDEX idx_api_usage_logs_ip_address ON api_usage_logs(ip_address);
CREATE INDEX idx_api_usage_logs_endpoint_id ON api_usage_logs(endpoint_id);
CREATE INDEX idx_api_keys_api_key ON api_keys(api_key);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Function to check if IP is in internal networks
CREATE OR REPLACE FUNCTION is_internal_ip(ip_addr INET)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM internal_networks 
    WHERE is_active = true 
    AND ip_addr << cidr_range::inet
  );
$$;

-- Function to get rate limit for endpoint and IP
CREATE OR REPLACE FUNCTION get_rate_limit(endpoint_path TEXT, ip_addr INET, user_id_param UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    -- Check for custom rate limit rules
    (SELECT requests_per_minute 
     FROM rate_limit_rules 
     WHERE is_active = true 
     AND ((target_type = 'ip' AND target_value = ip_addr::text)
          OR (target_type = 'cidr' AND ip_addr << target_value::inet)
          OR (target_type = 'user' AND target_value = user_id_param::text))
     ORDER BY 
       CASE target_type 
         WHEN 'ip' THEN 1
         WHEN 'user' THEN 2  
         WHEN 'cidr' THEN 3
         ELSE 4
       END
     LIMIT 1),
    -- Fall back to endpoint default rate limit
    (SELECT rate_limit_per_minute 
     FROM api_endpoints 
     WHERE path = endpoint_path),
    -- Final fallback
    30
  );
$$;

-- Trigger function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create update triggers
CREATE TRIGGER update_api_endpoints_updated_at
  BEFORE UPDATE ON api_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_access_control_updated_at
  BEFORE UPDATE ON api_access_control
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_internal_networks_updated_at
  BEFORE UPDATE ON internal_networks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limit_rules_updated_at
  BEFORE UPDATE ON rate_limit_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();