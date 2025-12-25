/**
 * Base Email Template
 * Reusable React Email component for consistent email styling
 */

import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Img,
  Hr,
  Button,
} from '@react-email/components';

export interface BaseEmailTemplateProps {
  previewText?: string;
  children: React.ReactNode;
  footerText?: string;
  unsubscribeUrl?: string;
}

export const BaseEmailTemplate: React.FC<BaseEmailTemplateProps> = ({
  previewText = 'Material Kai Vision Platform',
  children,
  footerText = '© 2025 Material Kai. All rights reserved.',
  unsubscribeUrl,
}) => {
  return (
    <Html>
      <Head>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        `}</style>
      </Head>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={logo}>Material Kai</Text>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            {children}
          </Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerTextStyle}>{footerText}</Text>
            {unsubscribeUrl && (
              <Link href={unsubscribeUrl} style={unsubscribeLink}>
                Unsubscribe
              </Link>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const header = {
  padding: '32px 40px',
  backgroundColor: '#1a1a1a',
};

const logo = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0',
};

const content = {
  padding: '0 40px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const footer = {
  padding: '0 40px',
};

const footerTextStyle = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '0',
};

const unsubscribeLink = {
  color: '#8898aa',
  fontSize: '12px',
  textDecoration: 'underline',
};

export default BaseEmailTemplate;

