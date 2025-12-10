-- Migration: User-Contact Linking
-- Description: Add user_id to crm_contacts for linking authenticated users to CRM contacts
-- Date: 2025-01-10

-- Add user_id columns to crm_contacts table
ALTER TABLE crm_contacts
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS linked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_crm_contacts_user ON crm_contacts(user_id);

-- Ensure one user can only be linked to one contact (1:1 relationship)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_user_unique 
ON crm_contacts(user_id) 
WHERE user_id IS NOT NULL;

-- Create audit table for tracking all user-contact linking actions
CREATE TABLE IF NOT EXISTS user_contact_links_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('linked', 'unlinked')),
  link_method VARCHAR(50) CHECK (link_method IN ('manual', 'auto_email_match', 'bulk')),
  linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for audit table
CREATE INDEX IF NOT EXISTS idx_user_contact_audit_contact 
ON user_contact_links_audit(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_contact_audit_user 
ON user_contact_links_audit(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_contact_audit_created 
ON user_contact_links_audit(created_at DESC);

-- Add comment to table
COMMENT ON TABLE user_contact_links_audit IS 'Audit log for all user-contact linking and unlinking actions';

-- Add comments to columns
COMMENT ON COLUMN crm_contacts.user_id IS 'Reference to authenticated user account (auth.users)';
COMMENT ON COLUMN crm_contacts.linked_at IS 'Timestamp when user was linked to this contact';
COMMENT ON COLUMN crm_contacts.linked_by IS 'Admin user who performed the linking action';

-- Enable RLS on audit table
ALTER TABLE user_contact_links_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all audit logs
CREATE POLICY "Admins can view all user-contact audit logs"
ON user_contact_links_audit
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

-- RLS Policy: Only admins can insert audit logs (system will use service role)
CREATE POLICY "System can insert user-contact audit logs"
ON user_contact_links_audit
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role_id IN (
      SELECT id FROM roles WHERE name IN ('admin', 'super_admin')
    )
  )
);

-- Function to automatically create audit log when user is linked
CREATE OR REPLACE FUNCTION log_user_contact_link()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if user_id changed
  IF (TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id) OR TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      -- User was linked
      INSERT INTO user_contact_links_audit (
        contact_id,
        user_id,
        action,
        link_method,
        linked_by,
        metadata
      ) VALUES (
        NEW.id,
        NEW.user_id,
        'linked',
        'manual', -- Default to manual, can be overridden
        NEW.linked_by,
        jsonb_build_object(
          'contact_email', NEW.email,
          'contact_name', NEW.name
        )
      );
    ELSIF OLD.user_id IS NOT NULL THEN
      -- User was unlinked
      INSERT INTO user_contact_links_audit (
        contact_id,
        user_id,
        action,
        link_method,
        linked_by,
        metadata
      ) VALUES (
        NEW.id,
        OLD.user_id,
        'unlinked',
        'manual',
        NEW.linked_by,
        jsonb_build_object(
          'contact_email', NEW.email,
          'contact_name', NEW.name
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic audit logging
DROP TRIGGER IF EXISTS trigger_log_user_contact_link ON crm_contacts;
CREATE TRIGGER trigger_log_user_contact_link
AFTER INSERT OR UPDATE OF user_id ON crm_contacts
FOR EACH ROW
EXECUTE FUNCTION log_user_contact_link();

-- Grant necessary permissions
GRANT SELECT ON user_contact_links_audit TO authenticated;
GRANT INSERT ON user_contact_links_audit TO authenticated;

