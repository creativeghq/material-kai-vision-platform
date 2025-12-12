# Logger Service Documentation

**Version:** 1.0  
**Last Updated:** December 12, 2024  
**File:** [`src/services/logger.service.ts`](../src/services/logger.service.ts)

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Where to See Logs](#where-to-see-logs)
4. [Basic Usage](#basic-usage)
5. [Advanced Usage](#advanced-usage)
6. [Configuration](#configuration)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Examples](#examples)

---

## Overview

The Logger Service is a centralized, structured logging system that replaces direct `console.*` calls throughout the application. It provides:

- **Structured logging** with metadata
- **Environment-aware** output (debug logs only in development)
- **Scoped loggers** for specific services/components
- **Log buffering** for debugging
- **Remote logging** capability for production monitoring
- **Type safety** with full TypeScript support

### Why Use This Instead of console.log?

| Feature | console.log | Logger Service |
|---------|-------------|----------------|
| Structured data | ❌ No | ✅ Yes (metadata) |
| Log levels | ❌ No | ✅ Yes (DEBUG, INFO, WARN, ERROR) |
| Environment aware | ❌ No | ✅ Yes |
| Filterable | ❌ No | ✅ Yes |
| Remote logging | ❌ No | ✅ Yes |
| Service context | ❌ No | ✅ Yes (scoped loggers) |
| Production safe | ❌ No | ✅ Yes |

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Your Application Code                  │
│  logger.info('User logged in', { userId: '123' })       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                Logger Service (logger.service.ts)        │
│  • Checks log level threshold                           │
│  • Adds timestamp, service name, metadata               │
│  • Stores in buffer (last 100 entries)                  │
│  • Decides where to output                              │
└─────┬─────────────────────────┬─────────────────────────┘
      │                         │
      │ Development            │ Production
      ▼                         ▼
┌──────────────────┐    ┌────────────────────────────────┐
│  Browser Console │    │  Remote Logging Service        │
│  • Colored logs  │    │  • Error tracking              │
│  • Full details  │    │  • Log aggregation             │
│  • Stack traces  │    │  • Monitoring dashboard        │
└──────────────────┘    └────────────────────────────────┘
```

### Log Flow

1. **You call:** `logger.info('message', { metadata })`
2. **Logger checks:** Is log level >= minimum threshold?
3. **Logger creates entry:**
   ```typescript
   {
     timestamp: '2024-12-12T09:00:00.000Z',
     level: LogLevel.INFO,
     message: 'message',
     metadata: { /* your data */ },
     service: 'YourService'
   }
   ```
4. **Logger outputs:**
   - **Development:** To browser console (you see it immediately)
   - **Production:** To remote service (for monitoring) + console for errors
5. **Logger buffers:** Keeps last 100 log entries in memory for debugging

---

## Where to See Logs

### 1. Browser Developer Console (Primary View)

**This is where you'll see most logs during development.**

#### How to Open:

- **Chrome/Edge:** Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- **Firefox:** Press `F12` or `Ctrl+Shift+K` (Windows) / `Cmd+Option+K` (Mac)
- **Safari:** Enable Developer menu in Preferences, then press `Cmd+Option+C`

#### What You'll See:

```
[INFO] 2024-12-12T09:00:00.000Z: User logged in
  { userId: '123', action: 'login', timestamp: 1702371600000 }

[WARN] 2024-12-12T09:00:05.000Z: API rate limit approaching
  { remaining: 10, limit: 100, service: 'ApiService' }

[ERROR] 2024-12-12T09:00:10.000Z: Failed to fetch user data
  { userId: '123', endpoint: '/api/users/123', service: 'UserService' }
  Error: Network request failed
    at fetch (...)
    Stack trace: ...
```

#### Filtering Console Logs:

1. **By level:**
   - Click console settings (gear icon)
   - Enable/disable: Verbose, Info, Warnings, Errors

2. **By service:**
   ```javascript
   // Type in console filter box
   service: "UserService"
   ```

3. **By text:**
   ```javascript
   // Type in console filter box
   logged in
   ```

### 2. Log Buffer (In-Memory Debugging)

**Access recent logs programmatically in the console.**

```javascript
// Open browser console and type:

// Get last 10 logs
import { logger } from './src/services/logger.service';
logger.getRecentLogs(10);

// Or access via window (in development)
window.__logger = logger; // If exposed
window.__logger.getRecentLogs();
```

**What you get:**
```javascript
[
  {
    timestamp: '2024-12-12T09:00:00.000Z',
    level: 1, // INFO
    message: 'User logged in',
    metadata: { userId: '123' },
    service: 'AuthService'
  },
  // ... more logs
]
```

### 3. Network Tab (Remote Logging)

**In production, logs are sent to a remote service.**

#### How to See:

1. Open Developer Tools (`F12`)
2. Go to **Network** tab
3. Filter by: `fetch` or your logging endpoint URL
4. Click on logging requests to see payload

**Example payload sent:**
```json
{
  "timestamp": "2024-12-12T09:00:00.000Z",
  "level": 3,
  "message": "API call failed",
  "metadata": {
    "endpoint": "/api/users",
    "statusCode": 500
  },
  "error": {
    "message": "Internal Server Error",
    "name": "Error",
    "stack": "Error: Internal Server Error\n    at ..."
  },
  "service": "MaterialKAI"
}
```

### 4. Production Monitoring Dashboard

**For production environments, integrate with monitoring services:**

- **Sentry** - Error tracking and performance monitoring
- **LogRocket** - Session replay with logs
- **Datadog** - Log aggregation and analytics
- **New Relic** - Application performance monitoring
- **Custom endpoint** - Your own logging service

#### Setup Example (Sentry):

```typescript
// In src/services/logger.service.ts configuration
import * as Sentry from '@sentry/browser';

// In remoteOutput method
if (env.isProduction) {
  Sentry.captureMessage(entry.message, {
    level: this.getSentryLevel(entry.level),
    extra: entry.metadata,
  });
}
```

---

## Basic Usage

### 1. Import the Logger

```typescript
import { logger } from '@/config';
// or
import { logger } from '@/services/logger.service';
```

### 2. Log Messages

```typescript
// Info - General information
logger.info('User logged in successfully', { 
  userId: user.id,
  timestamp: Date.now() 
});

// Warning - Something to be aware of
logger.warn('API rate limit approaching', { 
  remaining: 10,
  limit: 100 
});

// Error - Something went wrong
logger.error('Failed to save data', error, { 
  userId: user.id,
  operation: 'save' 
});

// Debug - Detailed debugging info (only in development)
logger.debug('Processing item', { 
  itemId: '123',
  step: 'validation' 
});
```

### 3. View in Console

Open browser console (`F12`) and you'll see:

```
[INFO] 2024-12-12T09:00:00.000Z: User logged in successfully
  { userId: 'user-123', timestamp: 1702371600000 }
```

---

## Advanced Usage

### Scoped Loggers (Recommended for Services)

**Create a logger specific to your service/component:**

```typescript
import { createLogger } from '@/config';

export class UserService {
  private logger = createLogger('UserService');

  async getUser(userId: string) {
    this.logger.info('Fetching user', { userId });
    
    try {
      const user = await this.fetchUser(userId);
      this.logger.info('User fetched successfully', { userId, hasData: !!user });
      return user;
    } catch (error) {
      this.logger.error('Failed to fetch user', error, { userId });
      throw error;
    }
  }
}
```

**Benefits:**
- Automatic service name in all logs
- Easy to filter logs by service
- Better organization

**Console output:**
```
[INFO] 2024-12-12T09:00:00.000Z: Fetching user
  { userId: 'user-123', service: 'UserService' }

[INFO] 2024-12-12T09:00:01.000Z: User fetched successfully
  { userId: 'user-123', hasData: true, service: 'UserService' }
```

### Accessing Recent Logs

```typescript
import { logger } from '@/config';

// Get last 50 logs
const recentLogs = logger.getRecentLogs(50);

// Analyze logs
const errorLogs = recentLogs.filter(log => log.level === LogLevel.ERROR);
console.log(`Found ${errorLogs.length} errors in recent logs`);

// Export logs for debugging
const logsJson = JSON.stringify(recentLogs, null, 2);
console.log(logsJson);
```

### Conditional Logging

```typescript
import { logger } from '@/config';
import { env } from '@/config/environment';

// Only log in development
if (env.isDevelopment) {
  logger.debug('Detailed debug info', { data: sensitiveData });
}

// Only log if feature is enabled
if (env.features.enableLogging) {
  logger.info('Feature is enabled', { feature: 'analytics' });
}
```

---

## Configuration

### Logger Configuration Object

```typescript
interface LoggerConfig {
  minLevel: LogLevel;           // Minimum level to log
  enableConsole: boolean;       // Output to console
  enableRemote: boolean;        // Send to remote service
  remoteEndpoint?: string;      // Remote logging URL
  serviceName: string;          // Default service name
}
```

### Default Configuration

```typescript
// In logger.service.ts
const config = {
  minLevel: env.isProduction ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: env.features.enableLogging,
  enableRemote: env.isProduction && env.features.enableAnalytics,
  serviceName: 'MaterialKAI',
};
```

### Customizing Configuration

```typescript
import { logger } from '@/config';

// Update configuration at runtime
logger.configure({
  minLevel: LogLevel.WARN,        // Only log warnings and errors
  enableRemote: true,             // Enable remote logging
  remoteEndpoint: 'https://your-logging-service.com/logs',
});
```

### Log Levels

```typescript
enum LogLevel {
  DEBUG = 0,    // Detailed debug information (dev only)
  INFO = 1,     // General informational messages
  WARN = 2,     // Warning messages
  ERROR = 3,    // Error messages
  NONE = 4,     // Disable all logging
}
```

**Level Hierarchy:**
- If `minLevel = LogLevel.WARN`, only WARN and ERROR logs are output
- DEBUG < INFO < WARN < ERROR < NONE

---

## Best Practices

### ✅ DO

```typescript
// 1. Use scoped loggers for services
const logger = createLogger('MyService');

// 2. Include relevant context in metadata
logger.info('Operation completed', {
  userId: user.id,
  duration: elapsedTime,
  result: 'success'
});

// 3. Log errors with the error object
logger.error('Failed to process', error, {
  operation: 'processData',
  itemId: item.id
});

// 4. Use appropriate log levels
logger.debug('Processing step 1');  // Debug info
logger.info('User logged in');      // Important event
logger.warn('Rate limit approaching'); // Warning
logger.error('API call failed');    // Error

// 5. Keep messages concise but descriptive
logger.info('User authentication successful', { userId, method: 'oauth' });
```

### ❌ DON'T

```typescript
// 1. Don't log sensitive data
logger.info('User logged in', { 
  password: user.password,  // ❌ NEVER!
  apiKey: user.apiKey       // ❌ NEVER!
});

// 2. Don't use console.* directly
console.log('User logged in'); // ❌ Use logger.info instead

// 3. Don't log in loops without throttling
for (let item of items) {
  logger.info('Processing item', { item }); // ❌ Will spam logs
}

// 4. Don't log without context
logger.info('Success'); // ❌ What succeeded?

// 5. Don't stringify objects manually
logger.info('Data: ' + JSON.stringify(data)); // ❌ Use metadata instead
logger.info('Data received', { data }); // ✅ Better
```

### Logging Patterns

#### Service Pattern

```typescript
export class DataService {
  private logger = createLogger('DataService');

  async fetchData(id: string) {
    this.logger.info('Fetching data', { id });

    try {
      const data = await this.apiCall(id);
      this.logger.info('Data fetched successfully', { id, size: data.length });
      return data;
    } catch (error) {
      this.logger.error('Failed to fetch data', error, { id });
      throw error;
    }
  }
}
```

#### Component Pattern

```typescript
export function UserProfile({ userId }: Props) {
  useEffect(() => {
    logger.debug('UserProfile mounted', { userId });
    
    return () => {
      logger.debug('UserProfile unmounted', { userId });
    };
  }, [userId]);

  const handleUpdate = async () => {
    logger.info('Updating user profile', { userId });
    try {
      await updateProfile(userId, data);
      logger.info('Profile updated successfully', { userId });
    } catch (error) {
      logger.error('Failed to update profile', error, { userId });
    }
  };

  // ...
}
```

---

## Troubleshooting

### Problem: Not seeing logs in console

**Solutions:**

1. **Check console filter level**
   - Open Console Settings (gear icon)
   - Ensure "Info" is enabled

2. **Check browser console level**
   - Make sure console is set to "All levels" or "Verbose"

3. **Check logger configuration**
   ```typescript
   import { logger } from '@/config';
   
   // Verify configuration
   logger.configure({
     minLevel: LogLevel.DEBUG,
     enableConsole: true
   });
   ```

4. **Check environment**
   ```typescript
   import { env } from '@/config';
   
   console.log('Logging enabled?', env.features.enableLogging);
   console.log('Environment:', env.nodeEnv);
   ```

### Problem: Logs not appearing in production

**Expected behavior:** Only INFO, WARN, and ERROR logs appear in production (DEBUG is filtered out)

**To verify:**
```typescript
import { env } from '@/config';

console.log('Environment:', env.nodeEnv);      // Should be 'production'
console.log('Is production:', env.isProduction); // Should be true
```

### Problem: Too many logs

**Solutions:**

1. **Increase minimum log level**
   ```typescript
   logger.configure({ minLevel: LogLevel.WARN }); // Only warnings and errors
   ```

2. **Filter in console**
   - Use console filter: `-service:VerboseService`
   - Filter by level: Click to disable INFO logs

3. **Use scoped loggers and filter**
   ```typescript
   // In console filter
   service: "ImportantService"
   ```

### Problem: Cannot access logger.getRecentLogs()

**Solution:** Make sure you're importing from the right place

```typescript
// ✅ Correct
import { logger } from '@/config';
logger.getRecentLogs(10);

// ❌ Wrong - createLogger returns scoped logger without getRecentLogs
const myLogger = createLogger('MyService');
myLogger.getRecentLogs; // undefined
```

---

## Examples

### Example 1: Authentication Service

```typescript
import { createLogger } from '@/config';
import { env } from '@/config/environment';

export class AuthService {
  private logger = createLogger('AuthService');

  async login(email: string, password: string) {
    this.logger.info('Login attempt', { email });

    try {
      const user = await this.authenticate(email, password);
      
      this.logger.info('Login successful', {
        userId: user.id,
        email: user.email,
        loginMethod: 'password'
      });

      // Only log sensitive operations in development
      if (env.isDevelopment) {
        this.logger.debug('User session created', {
          sessionId: user.sessionId,
          expiresAt: user.sessionExpiry
        });
      }

      return user;
    } catch (error) {
      this.logger.error('Login failed', error, {
        email,
        reason: error.message,
        attemptedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  async logout(userId: string) {
    this.logger.info('Logout initiated', { userId });
    
    try {
      await this.destroySession(userId);
      this.logger.info('Logout successful', { userId });
    } catch (error) {
      this.logger.warn('Logout partially failed', { userId, error: error.message });
      // Still succeed the logout from user perspective
    }
  }
}
```

**Console output:**
```
[INFO] 2024-12-12T09:00:00.000Z: Login attempt
  { email: 'user@example.com', service: 'AuthService' }

[INFO] 2024-12-12T09:00:01.000Z: Login successful
  {
    userId: 'user-123',
    email: 'user@example.com',
    loginMethod: 'password',
    service: 'AuthService'
  }

[DEBUG] 2024-12-12T09:00:01.100Z: User session created
  {
    sessionId: 'session-abc',
    expiresAt: '2024-12-13T09:00:00.000Z',
    service: 'AuthService'
  }
```

### Example 2: API Client with Retry Logic

```typescript
import { createLogger } from '@/config';

export class ApiClient {
  private logger = createLogger('ApiClient');

  async request(endpoint: string, options: RequestOptions, retries = 3) {
    this.logger.info('API request started', { 
      endpoint, 
      method: options.method,
      attempt: 1,
      maxRetries: retries
    });

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(endpoint, options);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        this.logger.info('API request successful', {
          endpoint,
          status: response.status,
          attempt,
          duration: Date.now() - startTime
        });

        return await response.json();

      } catch (error) {
        if (attempt < retries) {
          this.logger.warn('API request failed, retrying', {
            endpoint,
            attempt,
            maxRetries: retries,
            error: error.message,
            nextRetryIn: Math.pow(2, attempt) * 1000
          });

          await this.delay(Math.pow(2, attempt) * 1000);
        } else {
          this.logger.error('API request failed after all retries', error, {
            endpoint,
            attempts: retries,
            totalDuration: Date.now() - startTime
          });
          throw error;
        }
      }
    }
  }
}
```

### Example 3: React Component Lifecycle

```typescript
import { useEffect } from 'react';
import { logger } from '@/config';

export function MaterialSearch({ query }: Props) {
  useEffect(() => {
    logger.debug('MaterialSearch mounted', { query });

    const loadResults = async () => {
      logger.info('Starting material search', { query, timestamp: Date.now() });

      try {
        const results = await searchMaterials(query);
        
        logger.info('Search completed', {
          query,
          resultsCount: results.length,
          hasResults: results.length > 0
        });

      } catch (error) {
        logger.error('Search failed', error, { query });
      }
    };

    if (query) {
      loadResults();
    }

    return () => {
      logger.debug('MaterialSearch unmounted', { query });
    };
  }, [query]);

  // Component render...
}
```

---

## Quick Reference Card

### Import
```typescript
import { logger, createLogger } from '@/config';
```

### Log Methods
```typescript
logger.debug(message, metadata)    // Dev only
logger.info(message, metadata)     // General info
logger.warn(message, metadata)     // Warnings
logger.error(message, error, metadata) // Errors
```

### Scoped Logger
```typescript
const myLogger = createLogger('ServiceName');
myLogger.info(message, metadata);
```

### Utility Methods
```typescript
logger.getRecentLogs(count)   // Get recent logs
logger.clearBuffer()          // Clear log buffer
logger.configure(config)      // Update configuration
```

### Where to See Logs
1. Browser Console (`F12`)
2. `logger.getRecentLogs()` in console
3. Network tab (remote logging)
4. Production monitoring dashboard

---

## Related Documentation

- [Environment Configuration](./environment-configuration.md) (coming soon)
- [Migration Guide](../MIGRATION_GUIDE.md)
- [Integration Complete](../INTEGRATION_COMPLETE.md)
- [Code Review Report](../CODE_REVIEW_REPORT.md)

---

## Support

If you have questions or issues:

1. Check this documentation
2. Review examples above
3. Check [`src/services/logger.service.ts`](../src/services/logger.service.ts) implementation
4. Refer to [`MIGRATION_GUIDE.md`](../MIGRATION_GUIDE.md)

---

**Last Updated:** December 12, 2024  
**Version:** 1.0  
**Status:** Production Ready ✅
