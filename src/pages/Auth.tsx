import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { OAuthButtons } from '@/components/core/Auth/OAuthButtons';

export const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('signup');
  const [searchParams] = useSearchParams();
  // Supabase recovery links put tokens in the URL hash (#access_token=...&type=recovery).
  // Some project configs strip the ?reset=true query param, so also check the hash.
  const hashHasRecovery =
    typeof window !== 'undefined' && window.location.hash.includes('type=recovery');
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const isResetMode =
    searchParams.get('reset') === 'true' || hashHasRecovery || isRecoverySession;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Listen for Supabase's PASSWORD_RECOVERY event — fires after the recovery
  // link establishes a session. Belt-and-suspenders on top of URL detection.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Clear form state when switching tabs so sign-in fields don't bleed into sign-up
    setEmail('');
    setPassword('');
    setDisplayName('');
    setShowPassword(false);
    setShowForgotPassword(false);
  };
  const { signIn, signUp, resetPassword, updatePassword, user } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated — but NOT while completing a password reset,
  // because Supabase signs the user into a recovery session and we still need them
  // to set a new password before navigating away.
  useEffect(() => {
    if (user && !isResetMode) {
      navigate('/');
    }
  }, [user, navigate, isResetMode]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return;
    }
    setIsLoading(true);
    const { error } = await updatePassword(newPassword);
    setIsLoading(false);
    if (!error) {
      navigate('/');
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (!error) {
      navigate('/');
    }

    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error: _error } = await signUp(email, password, displayName);

    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await resetPassword(email);

    if (!error) {
      setShowForgotPassword(false);
      setEmail('');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/10 -z-10" />

      {/* Decorative elements */}
      <div className="fixed top-20 right-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl -z-10 animate-float" />
      <div className="fixed bottom-20 left-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl -z-10 animate-float" style={{ animationDelay: '2s' }} />

      <Card className="w-full max-w-md modern-card border-0 shadow-2xl">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-2">
            <span className="text-primary-foreground font-bold text-2xl">K</span>
          </div>
          <CardTitle className="text-3xl font-bold">
            {isResetMode
              ? 'Set a new password'
              : showForgotPassword
                ? 'Reset your password'
                : activeTab === 'signin'
                  ? 'Welcome back'
                  : 'Create an account'}
          </CardTitle>
          <CardDescription className="text-base">
            {isResetMode
              ? 'Enter a new password for your account'
              : showForgotPassword
                ? "We'll email you a link to set a new password"
                : activeTab === 'signin'
                  ? 'Sign in to your account'
                  : 'Sign up and get 30 day free trial'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isResetMode ? (
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-sm font-medium text-foreground">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-12 pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-10 w-10 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-12"
                />
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="text-sm text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isLoading || !newPassword || newPassword !== confirmPassword}
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Update password
              </Button>
            </form>
          ) : showForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-sm font-medium text-foreground">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Send Reset Link
              </Button>
              <div className="text-center text-sm pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setEmail('');
                  }}
                  className="text-foreground underline hover:text-primary font-medium"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0 mb-4">
              <TabsTrigger
                value="signin"
                className="flex-1 flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="flex-1 flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="text-sm font-medium text-foreground">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-sm font-medium text-foreground">Password</Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="h-12 pr-12"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-10 w-10 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setShowPassword(!showPassword);
                          }
                        }}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isLoading}>
                    {isLoading && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Sign In
                  </Button>

                  {/* OAuth Social Login */}
                  <OAuthButtons />

                  <div className="text-center text-sm pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setShowForgotPassword(true);
                        }
                      }}
                      className="text-muted-foreground hover:text-primary underline"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <div className="text-center text-sm border-t border-border pt-4">
                    <span className="text-muted-foreground">Don't have an account? </span>
                    <button
                      type="button"
                      onClick={() => handleTabChange('signup')}
                      className="text-foreground underline hover:text-primary font-medium"
                    >
                      Sign up
                    </button>
                  </div>
                </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-sm font-medium text-foreground">Full name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Amélie Laurent"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-medium text-foreground">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="amelielaurent7622@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-medium text-foreground">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-12 pr-12"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-10 w-10 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setShowPassword(!showPassword);
                        }
                      }}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Submit
                </Button>

                {/* OAuth Social Login */}
                <OAuthButtons />

                <div className="text-center text-sm pt-2">
                  <span className="text-muted-foreground">Have an account? </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('signin')}
                    className="text-foreground underline hover:text-primary font-medium"
                  >
                    Sign in
                  </button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center gap-8 text-sm">
        <a href="#" className="text-muted-foreground hover:text-foreground underline">
          Terms & Conditions
        </a>
      </div>
    </div>
  );
};

export default Auth;
