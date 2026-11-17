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

### Log Flow

1. **You call:** `logger.info('message', { metadata })`
2. **Logger checks:** Is log level >= minimum threshold?
3. **Logger creates entry** with timestamp, level, message, metadata, and service name
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

Log entries formatted as `[LEVEL] timestamp: message` followed by metadata on the next line. Errors include stack traces.

#### Filtering Console Logs:

1. **By level:**
   - Click console settings (gear icon)
   - Enable/disable: Verbose, Info, Warnings, Errors

2. **By service:** Type `service: "UserService"` in the console filter box

3. **By text:** Type any search term in the console filter box

### 2. Log Buffer (In-Memory Debugging)

**Access recent logs programmatically in the console.**

Import `logger` from `./src/services/logger.service` and call `logger.getRecentLogs(10)` to get the last N log entries. Each entry contains timestamp, level (numeric), message, metadata, and service name.

### 3. Network Tab (Remote Logging)

**In production, logs are sent to a remote service.**

#### How to See:

1. Open Developer Tools (`F12`)
2. Go to **Network** tab
3. Filter by: `fetch` or your logging endpoint URL
4. Click on logging requests to see payload

The payload includes timestamp, level, message, metadata, error details (if applicable), and service name.

### 4. Production Monitoring Dashboard

**For production environments, integrate with monitoring services:**

- **Sentry** - Error tracking and performance monitoring
- **LogRocket** - Session replay with logs
- **Datadog** - Log aggregation and analytics
- **New Relic** - Application performance monitoring
- **Custom endpoint** - Your own logging service

The setup involves configuring the logger's `remoteOutput` method to forward log entries to the chosen service (e.g., `Sentry.captureMessage` for Sentry integration).

---

## Basic Usage

### 1. Import the Logger

Import `logger` from `@/config` or `@/services/logger.service`.

### 2. Log Messages

Use `logger.info(message, metadata)` for general information, `logger.warn(message, metadata)` for warnings, `logger.error(message, error, metadata)` for errors, and `logger.debug(message, metadata)` for detailed debugging info (development only).

### 3. View in Console

Open browser console (`F12`) and you'll see formatted log entries with level, timestamp, message, and metadata.

---

## Advanced Usage

### Scoped Loggers (Recommended for Services)

**Create a logger specific to your service/component** using `createLogger('ServiceName')`. This automatically prefixes all log entries with the service name, making logs easy to filter.

**Benefits:**
- Automatic service name in all logs
- Easy to filter logs by service
- Better organization

### Accessing Recent Logs

Call `logger.getRecentLogs(count)` to retrieve recent log entries. You can then filter them by level, serialize to JSON, or analyze error patterns.

### Conditional Logging

Use environment checks (`env.isDevelopment`, `env.features.enableLogging`) to conditionally log sensitive or verbose information only when appropriate.

---

## Configuration

### Logger Configuration Object

The `LoggerConfig` interface has these fields: `minLevel` (minimum level to log), `enableConsole` (boolean), `enableRemote` (boolean), `remoteEndpoint` (optional URL), and `serviceName` (default service name).

### Default Configuration

In development, `minLevel` is `LogLevel.DEBUG` and console logging is enabled. In production, `minLevel` is `LogLevel.INFO` and remote logging is enabled when analytics is active.

### Customizing Configuration

Call `logger.configure(config)` at runtime to update settings such as `minLevel`, `enableRemote`, or `remoteEndpoint`.

### Log Levels

- `DEBUG = 0` - Detailed debug information (dev only)
- `INFO = 1` - General informational messages
- `WARN = 2` - Warning messages
- `ERROR = 3` - Error messages
- `NONE = 4` - Disable all logging

**Level Hierarchy:** If `minLevel = LogLevel.WARN`, only WARN and ERROR logs are output. DEBUG < INFO < WARN < ERROR < NONE.

---

## Best Practices

### ✅ DO

1. Use scoped loggers for services: `const logger = createLogger('MyService')`
2. Include relevant context in metadata (userId, duration, result)
3. Log errors with the error object as the second argument
4. Use appropriate log levels (debug for steps, info for events, warn for alerts, error for failures)
5. Keep messages concise but descriptive

### ❌ DON'T

1. Don't log sensitive data (passwords, API keys — NEVER!)
2. Don't use `console.*` directly — use `logger.info` instead
3. Don't log in tight loops without throttling
4. Don't log without context — "Success" says nothing; describe what succeeded
5. Don't stringify objects manually — pass them as metadata

### Logging Patterns

#### Service Pattern

Create a scoped logger as a class property. In each method, log before the operation (with relevant IDs), then log success with result metadata, and catch/log errors with the error object and context before re-throwing.

#### Component Pattern

In `useEffect`, log mount/unmount events with relevant props. In event handlers, log the action, then success or failure.

---

## Troubleshooting

### Problem: Not seeing logs in console

**Solutions:**

1. **Check console filter level** — Open Console Settings (gear icon) and ensure "Info" is enabled

2. **Check browser console level** — Make sure console is set to "All levels" or "Verbose"

3. **Check logger configuration** — Import `logger` from `@/config` and call `logger.configure({ minLevel: LogLevel.DEBUG, enableConsole: true })`

4. **Check environment** — Import `env` from `@/config` and verify `env.features.enableLogging` and `env.nodeEnv`

### Problem: Logs not appearing in production

**Expected behavior:** Only INFO, WARN, and ERROR logs appear in production (DEBUG is filtered out).

**To verify:** Check `env.nodeEnv` (should be `'production'`) and `env.isProduction` (should be `true`).

### Problem: Too many logs

**Solutions:**

1. **Increase minimum log level** — Call `logger.configure({ minLevel: LogLevel.WARN })`

2. **Filter in console** — Use console filter `-service:VerboseService` or disable INFO logs by clicking their level indicator

3. **Use scoped loggers and filter** — Type `service: "ImportantService"` in the console filter

### Problem: Cannot access logger.getRecentLogs()

**Solution:** Import `logger` from `@/config` (not via `createLogger`, which returns a scoped logger without `getRecentLogs`).

---

## Examples

### Example 1: Authentication Service

A scoped logger created as `createLogger('AuthService')` is used throughout the `AuthService` class. On `login`, it logs the attempt with the email, then on success logs the userId and loginMethod. Sensitive session details are only logged in development. On failure, it logs the error with email, reason, and timestamp before re-throwing. The `logout` method similarly logs initiation, success, or partial failure.

### Example 2: API Client with Retry Logic

An `ApiClient` using `createLogger('ApiClient')` logs each request attempt with endpoint and method. On each retry it logs a warning with attempt number, error message, and next retry delay. After all retries fail it logs an error with total duration before throwing.

### Example 3: React Component Lifecycle

A `MaterialSearch` component logs mount/unmount events via `useEffect`. Before searching it logs the query, on completion it logs result count, and on error it logs the failure with the query.

---

## Quick Reference Card

### Import

Import `logger` and `createLogger` from `@/config`.

### Log Methods

- `logger.debug(message, metadata)` — Dev only
- `logger.info(message, metadata)` — General info
- `logger.warn(message, metadata)` — Warnings
- `logger.error(message, error, metadata)` — Errors

### Scoped Logger

Create with `createLogger('ServiceName')` then call methods on the returned logger instance.

### Utility Methods

- `logger.getRecentLogs(count)` — Get recent logs
- `logger.clearBuffer()` — Clear log buffer
- `logger.configure(config)` — Update configuration

### Where to See Logs
1. Browser Console (`F12`)
2. `logger.getRecentLogs()` in console
3. Network tab (remote logging)
4. Production monitoring dashboard

---

## Related Documentation

- [Platform Secrets](./platform-secrets.md) - Environment & key configuration
- [Monitoring & Alerting](./monitoring-and-alerting.md)
- [AI Usage Logging](./ai-usage-logging-guide.md)

---

## Support

If you have questions or issues:

1. Check this documentation
2. Review examples above
3. Check [`src/services/logger.service.ts`](../src/services/logger.service.ts) implementation

---

**Last Updated:** December 12, 2024
**Version:** 1.0
**Status:** Production Ready ✅
