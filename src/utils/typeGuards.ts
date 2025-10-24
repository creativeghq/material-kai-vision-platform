/**
 * Type Guards and Validation Utilities
 *
 * Provides runtime type checking and validation functions to replace
 * unsafe 'unknown' types with proper type guards.
 */

/**
 * Basic type guards
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isString(value: any): value is string {
  return typeof value === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNull(value: any): value is null {
  return value === null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isUndefined(value: any): value is undefined {
  return value === undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNullish(value: any): value is null | undefined {
  return value === null || value === undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isObject(value: any): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isArray(value: any): value is any[] {
  return Array.isArray(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFunction(value: any): value is Function {
  return typeof value === 'function';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDate(value: any): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isError(value: any): value is Error {
  return value instanceof Error;
}

/**
 * Complex type guards
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isStringArray(value: any): value is string[] {
  return isArray(value) && value.every(isString);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNumberArray(value: any): value is number[] {
  return isArray(value) && value.every(isNumber);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isRecord(value: any): value is Record<string, unknown> {
  return isObject(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isStringRecord(value: any): value is Record<string, string> {
  return isObject(value) && Object.values(value).every(isString);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isNumberRecord(value: any): value is Record<string, number> {
  return isObject(value) && Object.values(value).every(isNumber);
}

/**
 * API response type guards
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isApiResponse(value: any): value is ApiResponse {
  return (
    isObject(value) &&
    isBoolean(value.success) &&
    (isUndefined(value.data) || value.data !== undefined) &&
    (isUndefined(value.error) || isString(value.error)) &&
    (isUndefined(value.message) || isString(value.message))
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSuccessfulApiResponse<T>(value: any): value is ApiResponse<T> & { success: true; data: T } {
  return isApiResponse(value) && value.success === true && value.data !== undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFailedApiResponse(value: any): value is ApiResponse & { success: false; error: string } {
  return isApiResponse(value) && value.success === false && isString(value.error);
}

/**
 * Database record type guards
 */
export interface DatabaseRecord {
  id: string;
  created_at: string;
  updated_at?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isDatabaseRecord(value: any): value is DatabaseRecord {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.created_at) &&
    (isUndefined(value.updated_at) || isString(value.updated_at))
  );
}

/**
 * Validation result type guards
 */
export interface ValidationResult<T = any> {
  isValid: boolean;
  data?: T;
  errors?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isValidationResult(value: any): value is ValidationResult {
  return (
    isObject(value) &&
    isBoolean(value.isValid) &&
    (isUndefined(value.data) || value.data !== undefined) &&
    (isUndefined(value.errors) || isStringArray(value.errors))
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isValidValidationResult<T>(value: any): value is ValidationResult<T> & { isValid: true; data: T } {
  return isValidationResult(value) && value.isValid === true && value.data !== undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isInvalidValidationResult(value: any): value is ValidationResult & { isValid: false; errors: string[] } {
  return isValidationResult(value) && value.isValid === false && isStringArray(value.errors);
}

/**
 * Event type guards
 */
export interface BaseEvent {
  type: string;
  timestamp: string;
  data?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isBaseEvent(value: any): value is BaseEvent {
  return (
    isObject(value) &&
    isString(value.type) &&
    isString(value.timestamp) &&
    (isUndefined(value.data) || value.data !== undefined)
  );
}

/**
 * Configuration type guards
 */
export interface BaseConfig {
  enabled: boolean;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isBaseConfig(value: any): value is BaseConfig {
  return isObject(value) && isBoolean(value.enabled);
}

/**
 * Utility functions for safe type conversion
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeParseJSON(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeParseNumber(value: any): number | null {
  const num = Number(value);
  return isNaN(num) ? null : num;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeParseBoolean(value: any): boolean {
  if (isBoolean(value)) return value;
  if (isString(value)) {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  if (isNumber(value)) return value !== 0;
  return false;
}

/**
 * Array validation utilities
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ensureArray<T>(value: any): T[] {
  if (isArray(value)) return value;
  if (isNullish(value)) return [];
  return [value];
}

export function filterValidItems<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  array: unknown[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validator: (item: unknown) => item is T,
): T[] {
  return array.filter(validator);
}

/**
 * Object validation utilities
 */
export function hasProperty<K extends string>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  key: K,
): obj is Record<K, any> {
  return isObject(obj) && key in obj;
}

export function hasStringProperty<K extends string>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  key: K,
): obj is Record<K, string> {
  return hasProperty(obj, key) && isString(obj[key]);
}

export function hasNumberProperty<K extends string>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  key: K,
): obj is Record<K, number> {
  return hasProperty(obj, key) && isNumber(obj[key]);
}

export function hasBooleanProperty<K extends string>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  key: K,
): obj is Record<K, boolean> {
  return hasProperty(obj, key) && isBoolean(obj[key]);
}

/**
 * Safe property access
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStringProperty(obj: any, key: string, defaultValue = ''): string {
  return hasStringProperty(obj, key) ? obj[key] : defaultValue;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNumberProperty(obj: any, key: string, defaultValue = 0): number {
  return hasNumberProperty(obj, key) ? obj[key] : defaultValue;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBooleanProperty(obj: any, key: string, defaultValue = false): boolean {
  return hasBooleanProperty(obj, key) ? obj[key] : defaultValue;
}

export function getArrayProperty<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validator?: (item: unknown) => item is T,
  defaultValue: T[] = [],
): T[] {
  if (!hasProperty(obj, key) || !isArray(obj[key])) {
    return defaultValue;
  }

  if (validator) {
    return filterValidItems(obj[key], validator);
  }

  return obj[key];
}

/**
 * Type assertion utilities
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function assertIsString(value: any, message = 'Expected string'): asserts value is string {
  if (!isString(value)) {
    throw new TypeError(`${message}, got ${typeof value}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function assertIsNumber(value: any, message = 'Expected number'): asserts value is number {
  if (!isNumber(value)) {
    throw new TypeError(`${message}, got ${typeof value}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function assertIsObject(value: any, message = 'Expected object'): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new TypeError(`${message}, got ${typeof value}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function assertIsArray(value: any, message = 'Expected array'): asserts value is any[] {
  if (!isArray(value)) {
    throw new TypeError(`${message}, got ${typeof value}`);
  }
}
