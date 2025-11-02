/**
 * Core Utility Types Library for Material Kai Vision Platform
 *
 * This module provides foundational utility types that enhance TypeScript's built-in
 * utility types with better error messages, more precise constraints, and advanced
 * type manipulation capabilities.
 *
 * @fileoverview Comprehensive utility types for advanced TypeScript patterns
 * @author TypeScript Specialist
 * @version 1.0.0
 */

// =============================================================================
// DEEP MANIPULATION UTILITIES
// =============================================================================

/**
 * Makes all properties in T optional recursively, including nested objects.
 * More powerful than TypeScript's built-in Partial<T> which only affects top-level properties.
 *
 * @template T - The type to make deeply partial
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   profile: {
 *     name: string;
 *     settings: {
 *       theme: string;
 *       notifications: boolean;
 *     };
 *   };
 * }
 *
 * type PartialUser = DeepPartial<User>;
 * // All properties including nested ones are optional
 * ```
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends readonly (infer U)[]
      ? readonly DeepPartial<U>[]
      : T[P] extends object
        ? DeepPartial<T[P]>
        : T[P];
};

/**
 * Makes all properties in T required recursively, including nested objects.
 * Opposite of DeepPartial<T> - ensures no undefined values exist anywhere in the type tree.
 *
 * @template T - The type to make deeply required
 * @example
 * ```typescript
 * type RequiredUser = DeepRequired<Partial<User>>;
 * // All properties including nested ones are required
 * ```
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends (infer U)[]
    ? DeepRequired<U>[]
    : T[P] extends readonly (infer U)[]
      ? readonly DeepRequired<U>[]
      : T[P] extends object | undefined
        ? DeepRequired<NonNullable<T[P]>>
        : T[P];
};

/**
 * Makes all properties in T readonly recursively, including nested objects.
 * Prevents mutation at any level of the object hierarchy.
 *
 * @template T - The type to make deeply readonly
 * @example
 * ```typescript
 * type ImmutableUser = DeepReadonly<User>;
 * // Cannot modify any property, including nested ones
 * ```
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T[P] extends readonly (infer U)[]
      ? readonly DeepReadonly<U>[]
      : T[P] extends object
        ? DeepReadonly<T[P]>
        : T[P];
};

// =============================================================================
// STRICT MANIPULATION UTILITIES
// =============================================================================

/**
 * More strict version of TypeScript's Omit<T, K> with better error messages.
 * Ensures that the keys being omitted actually exist in the original type.
 *
 * @template T - The original type
 * @template K - The keys to omit (must exist in T)
 * @example
 * ```typescript
 * interface User { id: string; name: string; email: string; }
 * type PublicUser = StrictOmit<User, 'id'>; // ✓ Valid
 * type InvalidUser = StrictOmit<User, 'nonexistent'>; // ✗ Compile error
 * ```
 */
export type StrictOmit<T, K extends keyof T> = Omit<T, K>;

/**
 * More strict version of TypeScript's Pick<T, K> with better error messages.
 * Ensures that the keys being picked actually exist in the original type.
 *
 * @template T - The original type
 * @template K - The keys to pick (must exist in T)
 * @example
 * ```typescript
 * interface User { id: string; name: string; email: string; }
 * type UserName = StrictPick<User, 'name'>; // ✓ Valid
 * type InvalidPick = StrictPick<User, 'nonexistent'>; // ✗ Compile error
 * ```
 */
export type StrictPick<T, K extends keyof T> = Pick<T, K>;

// =============================================================================
// KEY EXTRACTION UTILITIES
// =============================================================================

/**
 * Extracts keys from type T where the property type matches type U.
 * Useful for type-safe key extraction based on value types.
 *
 * @template T - The type to extract keys from
 * @template U - The value type to match
 * @example
 * ```typescript
 * interface Example {
 *   id: number;
 *   name: string;
 *   active: boolean;
 *   count: number;
 * }
 *
 * type NumberKeys = KeysOfType<Example, number>; // 'id' | 'count'
 * type StringKeys = KeysOfType<Example, string>; // 'name'
 * ```
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Extracts keys from type T where the property is optional.
 *
 * @template T - The type to extract optional keys from
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name?: string;
 *   email?: string;
 *   active: boolean;
 * }
 *
 * type OptionalUserKeys = OptionalKeys<User>; // 'name' | 'email'
 * ```
 */
export type OptionalKeys<T> = {
  [K in keyof T]: T extends Record<K, T[K]> ? never : K;
}[keyof T];

/**
 * Extracts keys from type T where the property is required.
 *
 * @template T - The type to extract required keys from
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name?: string;
 *   email?: string;
 *   active: boolean;
 * }
 *
 * type RequiredUserKeys = RequiredKeys<User>; // 'id' | 'active'
 * ```
 */
export type RequiredKeys<T> = {
  [K in keyof T]: T extends Record<K, T[K]> ? K : never;
}[keyof T];

// =============================================================================
// ARRAY UTILITIES
// =============================================================================

/**
 * Represents a non-empty array type - an array that must contain at least one element.
 * Provides compile-time guarantee that the array is not empty.
 *
 * @template T - The type of elements in the array
 * @example
 * ```typescript
 * const emptyArray: NonEmptyArray<string> = []; // ✗ Compile error
 * const validArray: NonEmptyArray<string> = ['hello']; // ✓ Valid
 *
 * function processItems(items: NonEmptyArray<Material>) {
 *   // Can safely access items[0] without checking length
 *   return items[0];
 * }
 * ```
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Checks if an array is non-empty at runtime and narrows the type.
 *
 * @param array - Array to check
 * @returns True if array has at least one element
 * @example
 * ```typescript
 * const materials: Material[] = getMaterials();
 * if (isNonEmptyArray(materials)) {
 *   // materials is now typed as NonEmptyArray<Material>
 *   const first = materials[0]; // Safe access
 * }
 * ```
 */
export function isNonEmptyArray<T>(array: T[]): array is NonEmptyArray<T> {
  return array.length > 0;
}

/**
 * Creates a non-empty array from the provided elements.
 *
 * @param first - First element (required)
 * @param rest - Additional elements
 * @returns Non-empty array
 * @example
 * ```typescript
 * const materials = createNonEmptyArray(material1, material2, material3);
 * // Type is NonEmptyArray<Material>
 * ```
 */
export function createNonEmptyArray<T>(
  first: T,
  ...rest: T[]
): NonEmptyArray<T> {
  return [first, ...rest];
}

/**
 * Gets the first element of a non-empty array (safe access).
 *
 * @param array - Non-empty array
 * @returns First element
 */
export function head<T>(array: NonEmptyArray<T>): T {
  return array[0];
}

/**
 * Gets all elements except the first from a non-empty array.
 *
 * @param array - Non-empty array
 * @returns Array of remaining elements (may be empty)
 */
export function tail<T>(array: NonEmptyArray<T>): T[] {
  return array.slice(1);
}

// =============================================================================
// FUNCTION UTILITIES
// =============================================================================

/**
 * Represents a type that may or may not be a promise.
 * Useful for functions that can work with both sync and async values.
 *
 * @template T - The wrapped type
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Extracts the return type from a function, handling both sync and async functions.
 *
 * @template T - Function type
 */
export type ReturnTypeAsync<T extends (...args: unknown[]) => unknown> =
  T extends (...args: unknown[]) => Promise<infer R>
    ? R
    : T extends (...args: unknown[]) => infer R
      ? R
      : never;

/**
 * Makes specific properties optional while keeping others required.
 *
 * @template T - Original type
 * @template K - Keys to make optional
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 * }
 *
 * type CreateUser = PartialBy<User, 'id'>; // id is optional, name and email required
 * ```
 */
export type PartialBy<T, K extends keyof T> = StrictOmit<T, K> &
  Partial<StrictPick<T, K>>;

/**
 * Makes specific properties required while keeping others as-is.
 *
 * @template T - Original type
 * @template K - Keys to make required
 */
export type RequiredBy<T, K extends keyof T> = T & Required<StrictPick<T, K>>;

// =============================================================================
// BRANDED TYPES
// =============================================================================

/**
 * Creates a branded type to prevent mixing of similar primitive types.
 *
 * @template T - Base type
 * @template Brand - Brand identifier
 * @example
 * ```typescript
 * type UserId = Brand<string, 'UserId'>;
 * type MaterialId = Brand<string, 'MaterialId'>;
 *
 * const userId: UserId = 'user123' as UserId;
 * const materialId: MaterialId = userId; // ✗ Compile error - different brands
 * ```
 */
export type Brand<T, Brand> = T & { readonly __brand: Brand };

/**
 * Creates a branded string type.
 */
export type BrandedString<B> = Brand<string, B>;

/**
 * Creates a branded number type.
 */
export type BrandedNumber<B> = Brand<number, B>;

// =============================================================================
// CONDITIONAL TYPE UTILITIES
// =============================================================================

/**
 * Checks if type T is exactly type U (strict equality).
 */
export type IsExact<T, U> =
  (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2
    ? true
    : false;

/**
 * Checks if type T extends type U.
 */
export type IsExtends<T, U> = T extends U ? true : false;

/**
 * Checks if type T is never.
 */
export type IsNever<T> = [T] extends [never] ? true : false;

/**
 * Checks if type T is any.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Checks if type T is unknown.
 */
export type IsUnknown<T> =
  IsAny<T> extends true ? false : unknown extends T ? true : false;

// =============================================================================
// OBJECT UTILITIES
// =============================================================================

/**
 * Merges two types, with properties from B overriding those in A.
 *
 * @template A - Base type
 * @template B - Override type
 */
export type Merge<A, B> = Omit<A, keyof A & keyof B> & B;

/**
 * Creates a type with all properties from A and B, requiring both to be present.
 */
export type Intersection<A, B> = A & B;

/**
 * Creates a union type where you can have properties from A, B, or both.
 */
export type Union<A, B> = A | B | (A & B);

/**
 * Removes properties with never values from a type.
 */
export type OmitNever<T> = Pick<
  T,
  { [K in keyof T]: T[K] extends never ? never : K }[keyof T]
>;

/**
 * Makes all properties mutable (removes readonly).
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Type representing a validation result.
 */
export type ValidationResult<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Type representing a result that can succeed or fail.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Helper to create a successful validation result.
 */
export function validationSuccess<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}

/**
 * Helper to create a failed validation result.
 */
export function validationFailure<E = string>(
  error: E,
): ValidationResult<never, E> {
  return { success: false, error };
}

/**
 * Helper to create a successful result.
 */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Helper to create a failed result.
 */
export function err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}

// =============================================================================
// TYPE ASSERTIONS AND GUARDS
// =============================================================================

/**
 * Type guard to check if a validation result is successful.
 */
export function isValidationSuccess<T, E>(
  result: ValidationResult<T, E>,
): result is { success: true; data: T } {
  return result.success;
}

/**
 * Type guard to check if a result is successful.
 */
export function isOk<T, E>(
  result: Result<T, E>,
): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Asserts that a value is defined (not null or undefined).
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to be defined');
  }
}

/**
 * Type guard to check if a value is defined.
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard to check if a value is not null.
 */
export function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

// =============================================================================
// STRING UTILITIES
// =============================================================================

/**
 * Template literal type utilities for string manipulation
 * These are re-exports of TypeScript's built-in string manipulation types
 */

/**
 * Converts string to uppercase using TypeScript's built-in utility.
 */
export type UppercaseString<S extends string> = Uppercase<S>;

/**
 * Converts string to lowercase using TypeScript's built-in utility.
 */
export type LowercaseString<S extends string> = Lowercase<S>;

/**
 * Capitalizes first letter of string using TypeScript's built-in utility.
 */
export type CapitalizeString<S extends string> = Capitalize<S>;

/**
 * Uncapitalizes first letter of string using TypeScript's built-in utility.
 */
export type UncapitalizeString<S extends string> = Uncapitalize<S>;

// =============================================================================
// EXPORTS FOR COMMON PATTERNS
// =============================================================================

/**
 * Common utility type combinations for Material Kai Vision Platform
 */

/** Represents a partial update to a material */
export type MaterialUpdate<T> = DeepPartial<T> & { id: string };

/** Represents a creation payload (omits generated fields if they exist) */
export type CreatePayload<T> = Omit<
  T,
  Extract<keyof T, 'id' | 'createdAt' | 'updatedAt'>
>;

/** Represents API response data with metadata */
export type WithMetadata<T> = T & {
  metadata: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };
};

/** Represents a timestamped entity */
export type Timestamped = {
  createdAt: string;
  updatedAt: string;
};

/** Represents an entity with ID */
export type WithId<T = string> = {
  id: T;
};

/** Standard entity type combining ID and timestamps */
export type Entity<T = string> = WithId<T> & Timestamped;

// =============================================================================
// API RESPONSE UTILITIES
// =============================================================================

/**
 * Generic API response wrapper with discriminated union for success/error states.
 * Provides type-safe handling of API responses with proper error discrimination.
 *
 * @template TData - Type of the successful response data
 * @template TError - Type of the error response (defaults to string)
 * @example
 * ```typescript
 * async function fetchMaterial(id: string): Promise<ApiResponse<Material>> {
 *   try {
 *     const data = await api.get(`/materials/${id}`);
 *     return apiSuccess(data);
 *   } catch (error) {
 *     return apiError('Failed to fetch material');
 *   }
 * }
 *
 * const response = await fetchMaterial('123');
 * if (isApiSuccess(response)) {
 *   // response.data is typed as Material
 *   console.log(response.data.name);
 * } else {
 *   // response.error is typed as string (or TError)
 *   console.error(response.error);
 * }
 * ```
 */
export type ApiResponse<TData, TError = string> =
  | { success: true; data: TData; error?: never }
  | { success: false; error: TError; data?: never };

/**
 * Helper function to create a successful API response.
 */
export function apiSuccess<TData>(data: TData): ApiResponse<TData> {
  return { success: true, data };
}

/**
 * Helper function to create a failed API response.
 */
export function apiError<TError = string>(
  error: TError,
): ApiResponse<never, TError> {
  return { success: false, error };
}

/**
 * Type guard to check if an API response is successful.
 */
export function isApiSuccess<TData, TError>(
  response: ApiResponse<TData, TError>,
): response is { success: true; data: TData } {
  return response.success;
}

/**
 * Type guard to check if an API response is an error.
 */
export function isApiError<TData, TError>(
  response: ApiResponse<TData, TError>,
): response is { success: false; error: TError } {
  return !response.success;
}

/**
 * Generic paginated response wrapper for list endpoints.
 * Provides consistent pagination metadata across all list APIs.
 *
 * @template TItem - Type of individual items in the list
 * @example
 * ```typescript
 * async function fetchMaterials(page: number): Promise<PaginatedResponse<Material>> {
 *   const response = await api.get(`/materials?page=${page}`);
 *   return {
 *     items: response.data,
 *     pagination: {
 *       currentPage: page,
 *       totalPages: response.totalPages,
 *       totalItems: response.totalItems,
 *       itemsPerPage: response.itemsPerPage,
 *       hasNextPage: page < response.totalPages,
 *       hasPreviousPage: page > 1
 *     }
 *   };
 * }
 * ```
 */
export interface PaginatedResponse<TItem> {
  /** Array of items for the current page */
  items: TItem[];
  /** Pagination metadata */
  pagination: {
    /** Current page number (1-based) */
    currentPage: number;
    /** Total number of pages */
    totalPages: number;
    /** Total number of items across all pages */
    totalItems: number;
    /** Number of items per page */
    itemsPerPage: number;
    /** Whether there is a next page */
    hasNextPage: boolean;
    /** Whether there is a previous page */
    hasPreviousPage: boolean;
  };
}

/**
 * Paginated API response combining ApiResponse with PaginatedResponse.
 */
export type PaginatedApiResponse<TItem, TError = string> = ApiResponse<
  PaginatedResponse<TItem>,
  TError
>;

// =============================================================================
// FORM DATA UTILITIES
// =============================================================================

/**
 * Form data wrapper that includes validation state and error handling.
 * Provides type-safe form state management with built-in validation support.
 *
 * @template TValues - Type of the form values
 * @template TErrors - Type of the form errors (defaults to Record<keyof TValues, string>)
 * @example
 * ```typescript
 * interface MaterialForm {
 *   name: string;
 *   category: string;
 *   properties: MaterialProperties;
 * }
 *
 * const formState: FormData<MaterialForm> = {
 *   values: { name: '', category: '', properties: {} },
 *   errors: {},
 *   isValid: false,
 *   isDirty: false,
 *   isSubmitting: false
 * };
 * ```
 */
export interface FormData<
  TValues,
  TErrors = Partial<Record<keyof TValues, string>>,
> {
  /** Current form values */
  values: TValues;
  /** Validation errors for each field */
  errors: TErrors;
  /** Whether the form is currently valid */
  isValid: boolean;
  /** Whether the form has been modified */
  isDirty: boolean;
  /** Whether the form is currently being submitted */
  isSubmitting: boolean;
  /** Whether the form has been touched/interacted with */
  isTouched?: boolean;
  /** Field-level touched state */
  touched?: Partial<Record<keyof TValues, boolean>>;
}

/**
 * Form submission state for tracking form operations.
 */
export type FormSubmissionState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Form field configuration for generic form handling.
 */
export interface FormField<TValue = unknown> {
  /** Field name/key */
  name: string;
  /** Field label for display */
  label: string;
  /** Field type for rendering */
  type:
    | 'text'
    | 'number'
    | 'email'
    | 'password'
    | 'select'
    | 'textarea'
    | 'checkbox'
    | 'radio';
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: TValue;
  /** Validation rules */
  validation?: {
    /** Minimum length for strings */
    minLength?: number;
    /** Maximum length for strings */
    maxLength?: number;
    /** Minimum value for numbers */
    min?: number;
    /** Maximum value for numbers */
    max?: number;
    /** Regex pattern for validation */
    pattern?: RegExp;
    /** Custom validation function */
    custom?: (value: TValue) => boolean | string;
  };
  /** Options for select/radio fields */
  options?: Array<{ label: string; value: TValue }>;
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Type-safe validation function that takes a value and returns a validation result.
 *
 * @template TInput - Type of the input value to validate
 * @template TOutput - Type of the validated output (defaults to TInput)
 * @example
 * ```typescript
 * const validateEmail: Validator<string> = (email) => {
 *   if (!email.includes('@')) {
 *     return validationFailure('Invalid email format');
 *   }
 *   return validationSuccess(email);
 * };
 *
 * const validateMaterial: Validator<unknown, Material> = (input) => {
 *   if (isMaterial(input)) {
 *     return validationSuccess(input);
 *   }
 *   return validationFailure('Invalid material object');
 * };
 * ```
 */
export type Validator<TInput, TOutput = TInput> = (
  input: TInput,
) => ValidationResult<TOutput>;

/**
 * Validation schema for complex objects with multiple fields.
 */
export type ValidationSchema<T> = {
  [K in keyof T]?: Validator<unknown, T[K]> | ValidationSchema<T[K]>;
};

/**
 * Runs validation on a value using the provided validator.
 */
export function validate<TInput, TOutput = TInput>(
  value: TInput,
  validator: Validator<TInput, TOutput>,
): ValidationResult<TOutput> {
  return validator(value);
}

/**
 * Composes multiple validators into a single validator.
 */
export function composeValidators<T>(
  ...validators: Validator<T>[]
): Validator<T> {
  return (input: T) => {
    for (const validator of validators) {
      const result = validator(input);
      if (!isValidationSuccess(result)) {
        return result;
      }
    }
    return validationSuccess(input);
  };
}

// =============================================================================
// ENTITY STATE UTILITIES
// =============================================================================

/**
 * Normalized entity state for managing collections of entities with efficient lookups.
 * Follows the Redux-style normalization pattern with type safety.
 *
 * @template TEntity - Type of the entity (must have an 'id' property)
 * @template TId - Type of the entity ID (defaults to string)
 * @example
 * ```typescript
 * interface Material {
 *   id: string;
 *   name: string;
 *   category: string;
 * }
 *
 * const materialState: EntityState<Material> = {
 *   entities: {
 *     'mat1': { id: 'mat1', name: 'Ceramic', category: 'tile' },
 *     'mat2': { id: 'mat2', name: 'Wood', category: 'flooring' }
 *   },
 *   ids: ['mat1', 'mat2'],
 *   loading: false,
 *   error: null
 * };
 * ```
 */
export interface EntityState<
  TEntity extends WithId<TId>,
  TId extends string | number = string,
> {
  /** Normalized entities by ID for O(1) lookups */
  entities: Record<TId, TEntity>;
  /** Ordered array of entity IDs */
  ids: TId[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Last fetch timestamp */
  lastFetched?: string;
  /** Total count (useful for pagination) */
  totalCount?: number;
}

/**
 * Helper function to create an empty entity state.
 */
export function createEntityState<
  TEntity extends WithId<TId>,
  TId extends string | number = string,
>(): EntityState<TEntity, TId> {
  return {
    entities: {} as Record<TId, TEntity>,
    ids: [],
    loading: false,
    error: null,
  };
}

/**
 * Helper function to add entities to entity state.
 */
export function addEntitiesToState<
  TEntity extends WithId<TId>,
  TId extends string | number = string,
>(
  state: EntityState<TEntity, TId>,
  entities: TEntity[],
): EntityState<TEntity, TId> {
  const newEntities = { ...state.entities };
  const newIds = [...state.ids];

  entities.forEach((entity) => {
    if (!newEntities[entity.id]) {
      newIds.push(entity.id);
    }
    newEntities[entity.id] = entity;
  });

  return {
    ...state,
    entities: newEntities,
    ids: newIds,
  };
}

/**
 * Helper function to update an entity in entity state.
 */
export function updateEntityInState<
  TEntity extends WithId<TId>,
  TId extends string | number = string,
>(
  state: EntityState<TEntity, TId>,
  id: TId,
  updates: Partial<TEntity>,
): EntityState<TEntity, TId> {
  const existingEntity = state.entities[id];
  if (!existingEntity) {
    return state;
  }

  return {
    ...state,
    entities: {
      ...state.entities,
      [id]: { ...existingEntity, ...updates },
    },
  };
}

/**
 * Helper function to remove an entity from entity state.
 */
export function removeEntityFromState<
  TEntity extends WithId<TId>,
  TId extends string | number = string,
>(state: EntityState<TEntity, TId>, id: TId): EntityState<TEntity, TId> {
  const entities = { ...state.entities };
  delete entities[id];
  const ids = state.ids.filter((entityId) => entityId !== id);

  return {
    ...state,
    entities,
    ids,
  };
}

// =============================================================================
// ASYNC UTILITIES
// =============================================================================

/**
 * Represents an async operation state with loading, data, and error states.
 */
export interface AsyncState<TData, TError = string> {
  /** The data when successfully loaded */
  data: TData | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: TError | null;
  /** Whether data has been loaded at least once */
  hasLoaded: boolean;
}

/**
 * Helper to create initial async state.
 */
export function createAsyncState<TData, TError = string>(): AsyncState<
  TData,
  TError
> {
  return {
    data: null,
    loading: false,
    error: null,
    hasLoaded: false,
  };
}

/**
 * Helper to create loading async state.
 */
export function asyncLoading<TData, TError = string>(): AsyncState<
  TData,
  TError
> {
  return {
    data: null,
    loading: true,
    error: null,
    hasLoaded: false,
  };
}

/**
 * Helper to create success async state.
 */
export function asyncSuccess<TData, TError = string>(
  data: TData,
): AsyncState<TData, TError> {
  return {
    data,
    loading: false,
    error: null,
    hasLoaded: true,
  };
}

/**
 * Helper to create error async state.
 */
export function asyncError<TData, TError = string>(
  error: TError,
): AsyncState<TData, TError> {
  return {
    data: null,
    loading: false,
    error,
    hasLoaded: true,
  };
}
