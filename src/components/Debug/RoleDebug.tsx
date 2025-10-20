import React from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

export const RoleDebug: React.FC = () => {
  const { user, session } = useAuth();
  const { isAdmin, role } = useUserRole();

  return (
    <div className="fixed top-4 right-4 bg-white border border-gray-300 rounded-lg p-4 shadow-lg z-50 max-w-sm">
      <h3 className="font-bold text-sm mb-2">🔍 Role Debug</h3>
      <div className="text-xs space-y-1">
        <p><strong>Email:</strong> {user?.email || 'Not logged in'}</p>
        <p><strong>Role:</strong> {role}</p>
        <p><strong>Is Admin:</strong> {isAdmin ? '✅ Yes' : '❌ No'}</p>
        <p><strong>Raw Role:</strong> {user?.raw_user_meta_data?.role || 'undefined'}</p>
        <p><strong>User Meta Role:</strong> {user?.user_metadata?.role || 'undefined'}</p>
        <p><strong>Session:</strong> {session ? '✅ Active' : '❌ None'}</p>
      </div>
    </div>
  );
};
