/**
 * Type Guards and Validation Utilities
 * 
 * Provides runtime type checking and validation functions to replace
 * unsafe 'unknown' types with proper type guards.
 */

/**
 * Basic type guards
 */
export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

export function isNull(value: any): value is null {
  return value === null;
}

export function isUndefined(value: any): value is undefined {
  return value === undefined;
}

export function isNullish(value: any): value is null | undefined {
  return value === null || value === undefined;
}

export function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isArray(value: any): value is any[] {
  return Array.isArray(value);
}

export function isFunction(value: any): value is Function {
  return typeof value === 'function';
}

export function isDate(value: any): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

export function isError(value: any): value is Error {
  return value instanceof Error;
}

/**
 * Complex type guards
 */
export function isStringArray(value: any): value is string[] {
  return isArray(value) && value.every(isString);
}

export function isNumberArray(value: any): value is number[] {
  return isArray(value) && value.every(isNumber);
}

export function isRecord(value: any): value is Record<string, any> {
  return isObject(value);
}

export function isStringRecord(value: any): value is Record<string, string> {
  return isObject(value) && Object.values(value).every(isString);
}

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

export function isApiResponse(value: any): value is ApiResponse {
  return (
    isObject(value) &&
    isBoolean(value.success) &&
    (isUndefined(value.data) || value.data !== undefined) &&
    (isUndefined(value.error) || isString(value.error)) &&
    (isUndefined(value.message) || isString(value.message))
  );
}

export function isSuccessfulApiResponse<T>(value: any): value is ApiResponse<T> & { success: true; data: T } {
  return isApiResponse(value) && value.success === true && value.data !== undefined;
}

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

export function isValidationResult(value: any): value is ValidationResult {
  return (
    isObject(value) &&
    isBoolean(value.isValid) &&
    (isUndefined(value.data) || value.data !== undefined) &&
    (isUndefined(value.errors) || isStringArray(value.errors))
  );
}

export function isValidValidationResult<T>(value: any): value is ValidationResult<T> & { isValid: true; data: T } {
  return isValidationResult(value) && value.isValid === true && value.data !== undefined;
}

export function isInvalidValidationResult(value: any): value is ValidationResult & { isValid: false; errors: string[] } {
  return isValidationResult(value) && value.isValid === false && isStringArray(value.errors);
}

/**
 * Event type guards
 */
export interface BaseEvent {
  type: string;
  timestamp: string;
  data?: any;
}

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
  [key: string]: any;
}

export function isBaseConfig(value: any): value is BaseConfig {
  return isObject(value) && isBoolean(value.enabled);
}

/**
 * Utility functions for safe type conversion
 */
export function safeParseJSON(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function safeStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function safeParseNumber(value: any): number | null {
  const num = Number(value);
  return isNaN(num) ? null : num;
}

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
export function ensureArray<T>(value: any): T[] {
  if (isArray(value)) return value;
  if (isNullish(value)) return [];
  return [value];
}

export function filterValidItems<T>(
  array: any[],
  validator: (item: any) => item is T
): T[] {
  return array.filter(validator);
}

/**
 * Object validation utilities
 */
export function hasProperty<K extends string>(
  obj: any,
  key: K
): obj is Record<K, any> {
  return isObject(obj) && key in obj;
}

export function hasStringProperty<K extends string>(
  obj: any,
  key: K
): obj is Record<K, string> {
  return hasProperty(obj, key) && isString(obj[key]);
}

export function hasNumberProperty<K extends string>(
  obj: any,
  key: K
): obj is Record<K, number> {
  return hasProperty(obj, key) && isNumber(obj[key]);
}

export function hasBooleanProperty<K extends string>(
  obj: any,
  key: K
): obj is Record<K, boolean> {
  return hasProperty(obj, key) && isBoolean(obj[key]);
}

/**
 * Safe property access
 */
export function getStringProperty(obj: any, key: string, defaultValue = ''): string {
  return hasStringProperty(obj, key) ? obj[key] : defaultValue;
}

export function getNumberProperty(obj: any, key: string, defaultValue = 0): number {
  return hasNumberProperty(obj, key) ? obj[key] : defaultValue;
}

export function getBooleanProperty(obj: any, key: string, defaultValue = false): boolean {
  return hasBooleanProperty(obj, key) ? obj[key] : defaultValue;
}

export function getArrayProperty<T>(
  obj: any,
  key: string,
  validator?: (item: any) => item is T,
  defaultValue: T[] = []
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
export function assertIsString(value: any, message = 'Expected string'): asserts value is string {
  if (!isString(value)) {
    throw new TypeError(`${message}, got ${typeof value}`);
  }
}

export function assertIsNumber(value: any, message = 'Expected number'): asserts value is number {
  if (!isNumber(value)) {
    throw new TypeError(`${message}, got ${typeof value}`);
  }
}

export function assertIsObject(value: any, message = 'Expected object'): asserts value is Record<string, any> {
  if (!isObject(value)) {
    throw new TypeError(`${message}, got ${typeof value}`);
  }
}

export function assertIsArray(value: any, message = 'Expected array'): asserts value is any[] {
  if (!isArray(value)) {
    throw new TypeError(`${message}, got ${typeof value}`);
  }
}
