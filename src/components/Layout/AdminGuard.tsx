import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

import { useUserRole } from '@/hooks/useUserRole';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AdminGuardProps {
  children: React.ReactNode;
  fallbackPath?: string;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({
  children,
  fallbackPath = '/',
}) => {
  const { isAdmin, role } = useUserRole();
  const navigate = useNavigate();

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-12">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-red-600" />
            </div>
            <CardTitle className="text-xl">Access Restricted</CardTitle>
            <CardDescription>
              This page is only available to administrators.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center text-sm text-muted-foreground">
              <p>
                Your current role:{' '}
                <span className="font-medium capitalize">{role}</span>
              </p>
              <p>
                Required role: <span className="font-medium">Admin</span>
              </p>
            </div>
            <Button
              onClick={() => navigate(fallbackPath)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  navigate(fallbackPath);
                }
              }}
              className="w-full"
              variant="outline"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
