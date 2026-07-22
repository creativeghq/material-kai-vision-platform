/**
 * #195 — route-level capability gate. Renders children only when the active persona
 * holds the capability; otherwise shows an access-restricted card (and never the page).
 * This is the URL-level half of capability gating — hiding the nav item isn't enough,
 * an end-user could otherwise type `/finance` directly.
 *
 *   <CapabilityGuard capability="finance.manage"><FinancePage /></CapabilityGuard>
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import type { Capability } from '@/auth/capabilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';

interface Props {
  /** Single required capability. */
  capability?: Capability;
  /** OR-gate: access is granted if the persona holds ANY of these (e.g. catalog browse). */
  anyOf?: Capability[];
  children: React.ReactNode;
  fallbackPath?: string;
}

export const CapabilityGuard: React.FC<Props> = ({ capability, anyOf, children, fallbackPath = '/' }) => {
  const { can, loading, persona } = usePermissions();
  const navigate = useNavigate();

  if (loading) return null;
  const allowed = (capability ? can(capability) : false) || (anyOf ? anyOf.some(can) : false);
  if (allowed) return <>{children}</>;

  return (
    <div className="container mx-auto py-12">
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-xl">Access Restricted</CardTitle>
          <CardDescription>This area isn’t available for your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Your access level: <span className="font-medium capitalize">{persona.replace('_', ' ')}</span>
          </p>
          <Button className="w-full" variant="outline" onClick={() => navigate(fallbackPath)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
