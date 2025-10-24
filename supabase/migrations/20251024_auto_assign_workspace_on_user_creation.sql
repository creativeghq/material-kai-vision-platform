-- Migration: Auto-assign new users to default workspace
-- Description: Creates a trigger that automatically adds new users to the first workspace
-- Created: 2025-10-24

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace_assignment()
RETURNS TRIGGER AS $$
DECLARE
  default_workspace_id UUID;
BEGIN
  -- Get the first workspace (default workspace)
  SELECT id INTO default_workspace_id
  FROM workspaces
  ORDER BY created_at ASC
  LIMIT 1;

  -- If a default workspace exists, add the user to it
  IF default_workspace_id IS NOT NULL THEN
    INSERT INTO workspace_members (workspace_id, user_id, role, status, permissions)
    VALUES (
      default_workspace_id,
      NEW.id,
      'member',
      'active',
      '["workspace:read", "workspace:write"]'::jsonb
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created_workspace_assignment ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace_assignment
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_workspace_assignment();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user_workspace_assignment() TO authenticated, anon, service_role;

