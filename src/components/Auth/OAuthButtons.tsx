import React, { useState } from 'react';
import { Chrome } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

/**
 * OAuth Sign-In Buttons
 * Provides Google OAuth sign-in option
 */
export const OAuthButtons: React.FC = () => {
  const { signInWithOAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handleOAuthSignIn = async (provider: 'google') => {
    try {
      setLoading(provider);
      const { error } = await signInWithOAuth(provider);

      if (error) {
        toast({
          title: 'Sign in failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('OAuth sign in error:', err);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-muted"></span>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* Google */}
        <Button
          variant="outline"
          onClick={() => handleOAuthSignIn('google')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleOAuthSignIn('google');
            }
          }}
          disabled={loading !== null}
          className="w-full"
        >
          {loading === 'google' ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          ) : (
            <>
              <Chrome className="h-4 w-4 mr-2" />
              <span>Sign in with Google</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default OAuthButtons;
