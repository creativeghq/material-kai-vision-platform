/**
 * Health Check Page Component
 * 
 * Provides a web interface for health and readiness checks
 * Also serves as API endpoints when accessed programmatically
 */

import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { healthCheck, readinessCheck, type HealthStatus, type ReadinessStatus } from '@/api/health';

const HealthPage: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [readinessStatus, setReadinessStatus] = useState<ReadinessStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const [health, readiness] = await Promise.all([
        healthCheck(),
        readinessCheck(),
      ]);
      
      setHealthStatus(health);
      setReadinessStatus(readiness);
      setLastChecked(new Date());
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(runHealthCheck, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string | boolean) => {
    if (typeof status === 'boolean') {
      return status ? (
        <CheckCircle className="w-5 h-5 text-green-500" />
      ) : (
        <XCircle className="w-5 h-5 text-red-500" />
      );
    }

    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string | boolean) => {
    if (typeof status === 'boolean') {
      return (
        <Badge variant={status ? 'default' : 'destructive'}>
          {status ? 'Ready' : 'Not Ready'}
        </Badge>
      );
    }

    const variant = status === 'healthy' ? 'default' : 
                   status === 'degraded' ? 'secondary' : 'destructive';
    
    return (
      <Badge variant={variant}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-6 h-6" />
          <h1 className="text-2xl font-bold">System Health Status</h1>
        </div>
        <div className="flex items-center space-x-4">
          {lastChecked && (
            <span className="text-sm text-muted-foreground">
              Last checked: {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <Button onClick={runHealthCheck} disabled={loading}>
            {loading ? 'Checking...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Health Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>Health Status</span>
              {healthStatus && getStatusIcon(healthStatus.status)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthStatus ? (
              <>
                <div className="flex items-center justify-between">
                  <span>Overall Status:</span>
                  {getStatusBadge(healthStatus.status)}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Database:</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(healthStatus.checks.database)}
                      <span className="text-sm">{healthStatus.checks.database}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Memory:</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(healthStatus.checks.memory)}
                      <span className="text-sm">{healthStatus.checks.memory}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Dependencies:</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(healthStatus.checks.dependencies)}
                      <span className="text-sm">{healthStatus.checks.dependencies}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-1 text-sm text-muted-foreground">
                  <div>Version: {healthStatus.version}</div>
                  <div>Uptime: {Math.floor(healthStatus.uptime)}s</div>
                  <div>Timestamp: {new Date(healthStatus.timestamp).toLocaleString()}</div>
                </div>

                {healthStatus.details && (
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Details:</h4>
                    <div className="space-y-1 text-sm">
                      {healthStatus.details.database && (
                        <div>Database: {healthStatus.details.database}</div>
                      )}
                      {healthStatus.details.memory && (
                        <div>
                          Memory: {Math.round(healthStatus.details.memory.percentage)}% used
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p>Loading health status...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Readiness Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>Readiness Status</span>
              {readinessStatus && getStatusIcon(readinessStatus.ready)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {readinessStatus ? (
              <>
                <div className="flex items-center justify-between">
                  <span>Ready for Traffic:</span>
                  {getStatusBadge(readinessStatus.ready)}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Database:</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(readinessStatus.checks.database)}
                      <span className="text-sm">
                        {readinessStatus.checks.database ? 'Ready' : 'Not Ready'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Configuration:</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(readinessStatus.checks.configuration)}
                      <span className="text-sm">
                        {readinessStatus.checks.configuration ? 'Ready' : 'Not Ready'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span>Dependencies:</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(readinessStatus.checks.dependencies)}
                      <span className="text-sm">
                        {readinessStatus.checks.dependencies ? 'Ready' : 'Not Ready'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-1 text-sm text-muted-foreground">
                  <div>Timestamp: {new Date(readinessStatus.timestamp).toLocaleString()}</div>
                </div>

                {readinessStatus.details && (
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Details:</h4>
                    <div className="space-y-1 text-sm">
                      {readinessStatus.details.database && (
                        <div>Database: {readinessStatus.details.database}</div>
                      )}
                      {readinessStatus.details.configuration && (
                        <div>Config: {readinessStatus.details.configuration}</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p>Loading readiness status...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HealthPage;
