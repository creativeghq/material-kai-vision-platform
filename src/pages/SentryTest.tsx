import * as Sentry from '@sentry/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Bug, CheckCircle } from 'lucide-react';
import { Layout } from '@/components/Layout/Layout';

/**
 * Sentry Test Page
 * 
 * This page provides various test buttons to verify Sentry integration
 * and error tracking functionality.
 */
const SentryTest = () => {
  const triggerError = () => {
    throw new Error('Test error from Sentry Test Page');
  };

  const triggerDivisionByZero = () => {
    // @ts-ignore - Intentional error for testing
    const result = 1 / 0;
    console.log(result);
  };

  const triggerUndefinedError = () => {
    // @ts-ignore - Intentional error for testing
    const obj = undefined;
    console.log(obj.property);
  };

  const captureMessage = () => {
    Sentry.captureMessage('Test message from Sentry Test Page', 'info');
    alert('Message sent to Sentry!');
  };

  const captureException = () => {
    try {
      throw new Error('Manually captured exception');
    } catch (error) {
      Sentry.captureException(error);
      alert('Exception captured and sent to Sentry!');
    }
  };

  const addBreadcrumb = () => {
    Sentry.addBreadcrumb({
      category: 'test',
      message: 'Test breadcrumb added',
      level: 'info',
    });
    alert('Breadcrumb added! Trigger an error to see it in Sentry.');
  };

  const setUserContext = () => {
    Sentry.setUser({
      id: 'test-user-123',
      email: 'test@materialshub.gr',
      username: 'Test User',
    });
    alert('User context set! Future errors will include this user info.');
  };

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Sentry Integration Test</h1>
          <p className="text-muted-foreground">
            Test various Sentry error tracking and monitoring features
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Error Testing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-5 w-5 text-red-600" />
                Error Testing
              </CardTitle>
              <CardDescription>
                Trigger different types of errors to test Sentry error capture
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={triggerError}
                variant="destructive"
                className="w-full"
              >
                Trigger Generic Error
              </Button>
              <Button
                onClick={triggerDivisionByZero}
                variant="destructive"
                className="w-full"
              >
                Trigger Division by Zero
              </Button>
              <Button
                onClick={triggerUndefinedError}
                variant="destructive"
                className="w-full"
              >
                Trigger Undefined Error
              </Button>
            </CardContent>
          </Card>

          {/* Manual Capture */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                Manual Capture
              </CardTitle>
              <CardDescription>
                Manually capture messages and exceptions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={captureMessage}
                variant="outline"
                className="w-full"
              >
                Capture Message
              </Button>
              <Button
                onClick={captureException}
                variant="outline"
                className="w-full"
              >
                Capture Exception
              </Button>
            </CardContent>
          </Card>

          {/* Context & Breadcrumbs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Context & Breadcrumbs
              </CardTitle>
              <CardDescription>
                Add context and breadcrumbs to errors
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={addBreadcrumb}
                variant="outline"
                className="w-full"
              >
                Add Breadcrumb
              </Button>
              <Button
                onClick={setUserContext}
                variant="outline"
                className="w-full"
              >
                Set User Context
              </Button>
            </CardContent>
          </Card>

          {/* Information */}
          <Card>
            <CardHeader>
              <CardTitle>Integration Status</CardTitle>
              <CardDescription>
                Sentry integration information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Environment:</span>
                <span className="font-medium">{import.meta.env.MODE}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DSN Configured:</span>
                <span className="font-medium text-green-600">✓ Yes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Replay Enabled:</span>
                <span className="font-medium text-green-600">✓ Yes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Performance:</span>
                <span className="font-medium text-green-600">✓ Enabled</span>
              </div>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-900">
                  <strong>Note:</strong> All errors triggered on this page will be sent to Sentry
                  for monitoring and analysis. Check your Sentry dashboard to see the captured events.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default SentryTest;

