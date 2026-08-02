/**
 * React Email Renderer for Deno Edge Functions
 * Renders React Email templates to HTML
 */

import { render } from 'npm:@react-email/render@1.0.0';
import * as React from 'npm:react@18.2.0';
import * as ReactEmailComponents from 'npm:@react-email/components@0.0.25';
import { escapeHtml } from './html.ts';

/**
 * Renders a React Email template to HTML
 * @param reactCode - The React Email template code as a string
 * @param variables - Variables to pass as props to the template
 * @returns Rendered HTML string
 */
export async function renderReactEmailTemplate(
  reactCode: string,
  variables: Record<string, any> = {}
): Promise<string> {
  try {
    // Create a module from the React code
    // We need to transform the code to work in Deno
    const transformedCode = transformReactCode(reactCode, variables);
    
    // Use dynamic import with data URL
    const moduleUrl = `data:text/javascript;base64,${btoa(transformedCode)}`;
    const module = await import(moduleUrl);
    
    // Get the default export (the email component)
    const EmailComponent = module.default;
    
    // Render the component to HTML
    const html = await render(React.createElement(EmailComponent, variables));
    
    return html;
  } catch (error) {
    console.error('Error rendering React Email template:', error);
    throw new Error(`Failed to render email template: ${error.message}`);
  }
}

/**
 * Transforms React Email code to work in Deno
 * Replaces imports and injects variables
 */
function transformReactCode(code: string, variables: Record<string, any>): string {
  // Remove the import statement and replace with our pre-imported modules
  let transformed = code.replace(
    /import\s+{([^}]+)}\s+from\s+['"]@react-email\/components['"];?/g,
    ''
  );
  
  // Extract component names from the original import
  const importMatch = code.match(/import\s+{([^}]+)}\s+from\s+['"]@react-email\/components['"]/);
  const componentNames = importMatch 
    ? importMatch[1].split(',').map(name => name.trim())
    : [];
  
  // Create destructuring from our global ReactEmailComponents
  const componentsDestructure = componentNames.length > 0
    ? `const { ${componentNames.join(', ')} } = ReactEmailComponents;`
    : '';
  
  // Wrap the code in a module that exports the component
  transformed = `
    import * as React from 'npm:react@18.2.0';
    import * as ReactEmailComponents from 'npm:@react-email/components@0.0.25';
    
    ${componentsDestructure}
    
    ${transformed}
  `;
  
  return transformed;
}

// escapeHtml is imported from _shared/html.ts, never hand-rolled here — CLAUDE.md invariant 11.
// This local copy happened to escape the same full set, so it was not a hole, but it is exactly
// the shape that let the earlier per-file copies drift to three different strengths. The canonical
// one also takes `unknown` and null-guards, where this took a bare `string`.

export function renderTemplateWithVariables(
  template: string,
  variables: Record<string, any>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] !== undefined ? escapeHtml(String(variables[key])) : `{{${key}}}`;
  });
}

/**
 * Validates React Email template code
 * Checks for common issues and returns validation errors
 */
export function validateReactEmailTemplate(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for required import
  if (!code.includes('@react-email/components')) {
    errors.push('Template must import components from @react-email/components');
  }
  
  // Check for default export
  if (!code.includes('export default')) {
    errors.push('Template must have a default export');
  }
  
  // Check for function component
  if (!code.match(/export\s+default\s+function\s+\w+/)) {
    errors.push('Template must export a function component');
  }
  
  // Check for Html component
  if (!code.includes('<Html')) {
    errors.push('Template should include an <Html> component as the root');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extracts variable names from React Email template code
 * Parses the function signature to find prop names
 */
export function extractTemplateVariables(code: string): string[] {
  const match = code.match(/function\s+\w+\s*\(\s*\{([^}]+)\}/);
  if (!match) return [];
  
  const propsString = match[1];
  const vars = propsString
    .split(',')
    .map(prop => prop.trim().split('=')[0].trim())
    .filter(v => v.length > 0);
  
  return vars;
}

/**
 * Generates a plain text version from React Email template
 * Strips HTML tags and formats the content
 */
export function generatePlainTextFromReactEmail(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Remove extra whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

