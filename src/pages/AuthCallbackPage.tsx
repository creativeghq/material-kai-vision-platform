import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * OAuth Callback Handler
 * Handles the redirect from OAuth providers (Google, GitHub, Microsoft)
 * Creates user profile on first login
 */
export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the session from the URL hash
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          toast({
            title: 'Authentication failed',
            description: 'No session found. Please try again.',
            variant: 'destructive',
          });
          navigate('/auth');
          return;
        }

        const user = session.user;

        // Check if user profile exists
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        // If profile doesn't exist, create one with default role (user)
        if (!existingProfile) {
          // Get the default user role
          const { data: userRole } = await supabase
            .from('roles')
            .select('id, name')
            .eq('name', 'user')
            .single();

          if (userRole) {
            // Update user metadata with role
            const { error: updateError } = await supabase.auth.updateUser({
              data: {
                role: userRole.name,
              },
            });

            if (updateError) {
              console.error('Error updating user metadata:', updateError);
            }

            const { error: profileError } = await supabase
              .from('user_profiles')
              .insert({
                user_id: user.id,
                role_id: userRole.id,
                subscription_tier: 'free',
                status: 'active',
              });

            if (profileError) {
              console.error('Error creating user profile:', profileError);
            }
          }

          // Create user credits account
          const { error: creditsError } = await supabase
            .from('user_credits')
            .insert({
              user_id: user.id,
              balance: 0,
            });

          if (creditsError) {
            console.error('Error creating user credits:', creditsError);
          }

          // Assign user to default workspace
          const { data: defaultWorkspace, error: workspaceError } =
            await supabase
              .from('workspaces')
              .select('id')
              .order('created_at', { ascending: true })
              .limit(1)
              .single();

          if (defaultWorkspace && !workspaceError) {
            const { error: membershipError } = await supabase
              .from('workspace_members')
              .insert({
                workspace_id: defaultWorkspace.id,
                user_id: user.id,
                role: 'member',
                status: 'active',
                permissions: ['workspace:read', 'workspace:write'],
              });

            if (membershipError) {
              console.error(
                'Error creating workspace membership:',
                membershipError,
              );
            } else {
              console.log(
                `✅ User ${user.email} added to workspace ${defaultWorkspace.id}`,
              );
            }
          } else {
            console.warn('⚠️ No default workspace found for new user');
          }
        }

        toast({
          title: 'Welcome',
          description: `Signed in as ${user.email}`,
        });

        // Redirect to dashboard
        navigate('/');
      } catch (error) {
        console.error('OAuth callback error:', error);
        toast({
          title: 'Authentication error',
          description:
            error instanceof Error ? error.message : 'An error occurred',
          variant: 'destructive',
        });
        navigate('/auth');
      } finally {
        setLoading(false);
      }
    };

    handleCallback();
  }, [navigate, toast]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">
          {loading ? 'Completing sign in...' : 'Redirecting...'}
        </p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;
