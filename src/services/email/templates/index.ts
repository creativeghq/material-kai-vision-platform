/**
 * Email Templates Index
 * Exports all available email templates and utilities
 */

import { render } from '@react-email/render';
import { WelcomeEmail, WelcomeEmailProps } from './WelcomeEmail';
import { TransactionalEmail, TransactionalEmailProps } from './TransactionalEmail';
import { BaseEmailTemplate } from './BaseEmailTemplate';

// Template registry
export const emailTemplates = {
  welcome: WelcomeEmail,
  transactional: TransactionalEmail,
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;

// Template props types
export type EmailTemplateProps = {
  welcome: WelcomeEmailProps;
  transactional: TransactionalEmailProps;
};

/**
 * Render an email template to HTML
 */
export function renderEmailTemplate<T extends EmailTemplateName>(
  templateName: T,
  props: EmailTemplateProps[T]
): { html: string; text: string } {
  const Template = emailTemplates[templateName];
  const html = render(<Template {...props} />);
  
  // Generate plain text version (basic implementation)
  const text = html
    .replace(/<style[^>]*>.*?<\/style>/gs, '')
    .replace(/<script[^>]*>.*?<\/script>/gs, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { html, text };
}

/**
 * Preview email template (for development/testing)
 */
export function previewEmailTemplate<T extends EmailTemplateName>(
  templateName: T,
  props: EmailTemplateProps[T]
): string {
  const Template = emailTemplates[templateName];
  return render(<Template {...props} />, { pretty: true });
}

// Export individual templates
export { WelcomeEmail, TransactionalEmail, BaseEmailTemplate };
export type { WelcomeEmailProps, TransactionalEmailProps };

