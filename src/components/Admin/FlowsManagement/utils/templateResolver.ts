/**
 * Resolves template expressions like {{trigger.data.email}} against a context object.
 * Uses dot-notation path traversal.
 */

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function resolveTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path: string) => {
    const value = getNestedValue(context, path.trim());
    return value !== undefined ? String(value) : match;
  });
}

export function resolveAllTemplates<T extends Record<string, unknown>>(
  config: T,
  context: Record<string, unknown>,
): T {
  const resolved = { ...config };
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string') {
      (resolved as Record<string, unknown>)[key] = resolveTemplate(value, context);
    }
  }
  return resolved;
}
