/** React Email Renderer for Deno Edge Functions. */

import { render } from 'npm:@react-email/render@1.0.0';
import * as React from 'npm:react@18.2.0';
import * as ReactEmailComponents from 'npm:@react-email/components@0.0.25';

/** Renders a React Email template to HTML. */
export async function renderReactEmailTemplate(
  reactCode: string,
  variables: Record<string, any> = {}
): Promise<string> {
  try {
    const transformedCode = transformReactCode(reactCode, variables);
    
    const moduleUrl = `data:text/javascript;base64,${btoa(transformedCode)}`;
    const module = await import(moduleUrl);
    
    const EmailComponent = module.default;
    
    const html = await render(React.createElement(EmailComponent, variables));
    
    return html;
  } catch (error) {
    console.error('Error rendering React Email template:', error);
    throw new Error(
      `Failed to render email template: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Transforms React Email code to work in Deno. */
function transformReactCode(code: string, variables: Record<string, any>): string {
  let transformed = code.replace(
    /import\s+{([^}]+)}\s+from\s+['"]@react-email\/components['"];?/g,
    ''
  );
  
  const importMatch = code.match(/import\s+{([^}]+)}\s+from\s+['"]@react-email\/components['"]/);
  const componentNames = importMatch 
    ? importMatch[1].split(',').map(name => name.trim())
    : [];
  
  const componentsDestructure = componentNames.length > 0
    ? `const { ${componentNames.join(', ')} } = ReactEmailComponents;`
    : '';
  
  transformed = `
    import * as React from 'npm:react@18.2.0';
    import * as ReactEmailComponents from 'npm:@react-email/components@0.0.25';
    
    ${componentsDestructure}
    
    ${transformed}
  `;
  
  return transformed;
}

/** Validates React Email template code. */
export function validateReactEmailTemplate(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!code.includes('@react-email/components')) {
    errors.push('Template must import components from @react-email/components');
  }
  
  if (!code.includes('export default')) {
    errors.push('Template must have a default export');
  }
  
  if (!code.match(/export\s+default\s+function\s+\w+/)) {
    errors.push('Template must export a function component');
  }
  
  if (!code.includes('<Html')) {
    errors.push('Template should include an <Html> component as the root');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Extracts variable names from a template's function signature. */
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
